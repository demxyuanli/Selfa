import torch
import torch.nn as nn
import numpy as np
import argparse
import json
import sys
from huggingface_hub import hf_hub_download, list_repo_files

# Try to import TensorFlow/Keras for Keras model support
try:
    import tensorflow as tf
    HAS_TF = True
except ImportError:
    HAS_TF = False

# Configuration matching the likely training setup of jengyang/lstm-stock-prediction-model
# Note: These are educated guesses based on common tutorials unless config.json exists
SEQUENCE_LENGTH = 60
INPUT_SIZE = 1
HIDDEN_SIZE = 50
NUM_LAYERS = 2

class StockLSTM(nn.Module):
    def __init__(self, input_size=1, hidden_size=50, num_layers=2, output_size=1):
        super(StockLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :])
        return out

def load_model(repo_id="jengyang/lstm-stock-prediction-model"):
    try:
        # First, try to list repository files to see what's available
        try:
            files = list_repo_files(repo_id=repo_id)
            print(f"Available files in repository: {files}", file=sys.stderr)
        except:
            pass
        
        # Try different possible filenames for PyTorch models
        possible_filenames = [
            "model.pth",
            "pytorch_model.bin",
            "model.bin",
            "lstm_model.pth",
            "stock_lstm.pth",
            "pytorch_model.pt",
            "model.pt"
        ]
        
        model_path = None
        scaler_path = None
        metadata_path = None
        last_error = None
        
        for filename in possible_filenames:
            try:
                model_path = hf_hub_download(repo_id=repo_id, filename=filename)
                print(f"Found PyTorch model file: {filename}", file=sys.stderr)
                break
            except Exception as e:
                last_error = e
                continue
        
        # If no PyTorch model found, try Keras models
        if model_path is None:
            keras_files = [
                "stage2_universal_lstm_20250705_170829.keras",
                "model.keras",
                "lstm_model.keras"
            ]
            
            for filename in keras_files:
                try:
                    model_path = hf_hub_download(repo_id=repo_id, filename=filename)
                    print(f"Found Keras model file: {filename}", file=sys.stderr)
                    break
                except Exception as e:
                    last_error = e
                    continue
            
            # Try to find any .keras file
            if model_path is None:
                try:
                    files = list_repo_files(repo_id=repo_id)
                    keras_file = next((f for f in files if f.endswith('.keras')), None)
                    if keras_file:
                        model_path = hf_hub_download(repo_id=repo_id, filename=keras_file)
                        print(f"Found Keras model file: {keras_file}", file=sys.stderr)
                except:
                    pass
            
            # Try to find scaler and metadata files
            if model_path:
                try:
                    files = list_repo_files(repo_id=repo_id)
                    scaler_file = next((f for f in files if 'scaler' in f.lower() and f.endswith('.pkl')), None)
                    metadata_file = next((f for f in files if 'metadata' in f.lower() and f.endswith('.json')), None)
                    
                    if scaler_file:
                        scaler_path = hf_hub_download(repo_id=repo_id, filename=scaler_file)
                        print(f"Found scaler file: {scaler_file}", file=sys.stderr)
                    if metadata_file:
                        metadata_path = hf_hub_download(repo_id=repo_id, filename=metadata_file)
                        print(f"Found metadata file: {metadata_file}", file=sys.stderr)
                except:
                    pass
            
            if model_path is None:
                try:
                    files = list_repo_files(repo_id=repo_id)
                    available_files = ", ".join(files)
                    return None, f"Model file not found. Available files: {available_files}. Last error: {last_error}"
                except:
                    return None, f"Model file not found. Repository may not exist or is private. Last error: {last_error}"

        # Handle Keras model
        if model_path and model_path.endswith('.keras'):
            if not HAS_TF:
                return None, f"Keras model detected ({model_path}) but TensorFlow is not installed. Please install TensorFlow: pip install tensorflow"
            
            try:
                import json as json_lib
                import pickle
                
                model = tf.keras.models.load_model(model_path)
                
                # Load metadata if available
                metadata = None
                if metadata_path:
                    try:
                        with open(metadata_path, 'r') as f:
                            metadata = json_lib.load(f)
                            print(f"Loaded metadata: {metadata}", file=sys.stderr)
                    except:
                        pass
                
                # Load scaler if available
                scaler = None
                if scaler_path:
                    try:
                        with open(scaler_path, 'rb') as f:
                            scaler = pickle.load(f)
                            print(f"Loaded scaler", file=sys.stderr)
                    except:
                        pass
                
                return (model, scaler, metadata), None
            except Exception as e:
                return None, f"Failed to load Keras model: {e}"

    except Exception as e:
        return None, f"Failed to access repository: {e}"

    # Handle PyTorch model
    model = StockLSTM(INPUT_SIZE, HIDDEN_SIZE, NUM_LAYERS)
    try:
        state_dict = torch.load(model_path, map_location=torch.device('cpu'))
        # Handle different state dict formats
        if isinstance(state_dict, dict):
            if 'model_state_dict' in state_dict:
                state_dict = state_dict['model_state_dict']
            elif 'state_dict' in state_dict:
                state_dict = state_dict['state_dict']
        model.load_state_dict(state_dict, strict=False)
    except Exception as e:
        return None, f"Architecture mismatch or load error: {e}"
        
    model.eval()
    return model, None

def predict(model, prices, steps=1):
    predictions = []
    current_sequence = np.array(prices[-SEQUENCE_LENGTH:])
    
    # Handle Keras model
    if HAS_TF and isinstance(model, tuple) and isinstance(model[0], tf.keras.Model):
        keras_model, scaler, metadata = model
        
        # Check model input shape from metadata or model itself
        input_shape = keras_model.input_shape
        print(f"Keras model input shape: {input_shape}", file=sys.stderr)
        
        # The model expects (batch, 60, 6) - 6 features
        # We only have prices, so we'll create synthetic features
        if len(input_shape) == 3 and input_shape[2] == 6:
            # Create 6 features from prices: [price, price_change, ma5, ma10, ma20, volume_simulated]
            features = []
            for i in range(len(current_sequence)):
                price = current_sequence[i]
                price_change = current_sequence[i] - current_sequence[i-1] if i > 0 else 0
                ma5 = np.mean(current_sequence[max(0, i-4):i+1]) if i >= 4 else price
                ma10 = np.mean(current_sequence[max(0, i-9):i+1]) if i >= 9 else price
                ma20 = np.mean(current_sequence[max(0, i-19):i+1]) if i >= 19 else price
                volume_sim = 1.0  # Simulated volume
                features.append([price, price_change, ma5, ma10, ma20, volume_sim])
            
            features = np.array(features)
            
            # Apply scaler if available
            if scaler is not None:
                try:
                    features = scaler.transform(features)
                except:
                    # If scaler fails, normalize manually
                    features = (features - np.mean(features, axis=0)) / (np.std(features, axis=0) + 1e-8)
            else:
                # Manual normalization
                features = (features - np.mean(features, axis=0)) / (np.std(features, axis=0) + 1e-8)
            
            input_tensor = np.expand_dims(features, axis=0)  # (1, 60, 6)
            
            for _ in range(steps):
                pred_norm = keras_model.predict(input_tensor, verbose=0)
                pred_val = float(pred_norm[0][0])
                
                # Denormalize (assuming price is first feature)
                # This is a simplification - real denormalization would use scaler
                mean_price = np.mean(current_sequence)
                std_price = np.std(current_sequence)
                real_pred = pred_val * std_price + mean_price
                predictions.append(real_pred)
                
                # Update sequence and features for next step
                current_sequence = np.append(current_sequence[1:], real_pred)
                
                # Recalculate features
                features = []
                for i in range(len(current_sequence)):
                    price = current_sequence[i]
                    price_change = current_sequence[i] - current_sequence[i-1] if i > 0 else 0
                    ma5 = np.mean(current_sequence[max(0, i-4):i+1]) if i >= 4 else price
                    ma10 = np.mean(current_sequence[max(0, i-9):i+1]) if i >= 9 else price
                    ma20 = np.mean(current_sequence[max(0, i-19):i+1]) if i >= 19 else price
                    volume_sim = 1.0
                    features.append([price, price_change, ma5, ma10, ma20, volume_sim])
                
                features = np.array(features)
                if scaler is not None:
                    try:
                        features = scaler.transform(features)
                    except:
                        features = (features - np.mean(features, axis=0)) / (np.std(features, axis=0) + 1e-8)
                else:
                    features = (features - np.mean(features, axis=0)) / (np.std(features, axis=0) + 1e-8)
                
                input_tensor = np.expand_dims(features, axis=0)
        else:
            # Fallback: single feature
            current_sequence = current_sequence.reshape(-1, 1)
            min_val = np.min(current_sequence)
            max_val = np.max(current_sequence)
            scale = max_val - min_val if max_val != min_val else 1.0
            normalized_seq = (current_sequence - min_val) / scale
            
            input_tensor = np.expand_dims(normalized_seq, axis=0)  # (1, 60, 1)
            
            for _ in range(steps):
                pred_norm = keras_model.predict(input_tensor, verbose=0)
                pred_val = float(pred_norm[0][0])
                
                real_pred = pred_val * scale + min_val
                predictions.append(real_pred)
                
                new_step_norm = np.array([[[pred_val]]])
                input_tensor = np.concatenate([input_tensor[:, 1:, :], new_step_norm], axis=1)
    else:
        # Handle PyTorch model
        current_sequence = current_sequence.reshape(-1, 1)
        min_val = np.min(current_sequence)
        max_val = np.max(current_sequence)
        if max_val == min_val:
            scale = 1.0
        else:
            scale = max_val - min_val
            
        normalized_seq = (current_sequence - min_val) / scale
        
        input_tensor = torch.FloatTensor(normalized_seq).unsqueeze(0) # (1, 60, 1)
        
        with torch.no_grad():
            for _ in range(steps):
                pred_norm = model(input_tensor)
                pred_val = pred_norm.item()
                
                # Append to predictions (denormalized)
                real_pred = pred_val * scale + min_val
                predictions.append(real_pred)
                
                # Update sequence for next step (sliding window)
                # Remove first, add new prediction
                new_step_norm = torch.tensor([[[pred_val]]], dtype=torch.float32)
                input_tensor = torch.cat((input_tensor[:, 1:, :], new_step_norm), dim=1)
            
    return predictions

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prices', type=str, required=True, help='Comma separated prices')
    parser.add_argument('--steps', type=int, default=5, help='Prediction steps')
    args = parser.parse_args()

    try:
        prices = [float(x) for x in args.prices.split(',')]
    except:
        print(json.dumps({"error": "Invalid price format"}))
        sys.exit(1)

    if len(prices) < SEQUENCE_LENGTH:
        print(json.dumps({"error": f"Need at least {SEQUENCE_LENGTH} price points"}))
        sys.exit(1)

    model, err = load_model()
    if err:
        print(json.dumps({"error": err}))
        sys.exit(1)

    try:
        preds = predict(model, prices, args.steps)
        print(json.dumps({
            "prediction": preds,
            "last_price": prices[-1]
        }))
    except Exception as e:
        print(json.dumps({"error": f"Prediction error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
