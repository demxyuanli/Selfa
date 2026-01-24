import sys
import json
import torch
import argparse
import numpy as np
from chronos import ChronosPipeline

def main():
    parser = argparse.ArgumentParser(description='Chronos Stock Prediction')
    parser.add_argument('--prices', type=str, help='Comma separated historical prices', required=True)
    parser.add_argument('--steps', type=int, default=10, help='Prediction steps')
    args = parser.parse_args()

    # Parse prices
    try:
        prices = [float(x) for x in args.prices.split(',')]
    except ValueError:
        print(json.dumps({"error": "Invalid price format"}))
        sys.exit(1)

    # Convert to tensor
    context = torch.tensor([prices])

    # Load model
    try:
        pipeline = ChronosPipeline.from_pretrained(
            "amazon/chronos-t5-small",
            device_map="cuda" if torch.cuda.is_available() else "cpu",
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        )
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {str(e)}"}))
        sys.exit(1)

    # Predict
    try:
        forecast = pipeline.predict(
            context,
            prediction_length=args.steps,
            num_samples=20,
        )
        
        # Get median prediction
        low, median, high = torch.quantile(forecast[0], torch.tensor([0.1, 0.5, 0.9]), dim=0)
        
        result = {
            "prediction": median.numpy().tolist(),
            "lower_bound": low.numpy().tolist(),
            "upper_bound": high.numpy().tolist()
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": f"Prediction failed: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
