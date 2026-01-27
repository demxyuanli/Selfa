use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub provider: String,
    pub api_key: Option<String>,
    pub endpoint: String,
    pub auth_header: String,
    pub model_mapping: Option<String>,
}

pub fn map_groq_model(model: &str) -> String {
    if model.starts_with("groq:") {
        model.strip_prefix("groq:").unwrap_or(model).to_string()
    } else if model.starts_with("llama") {
        "llama-3.1-70b-versatile".to_string()
    } else if model.starts_with("mixtral") {
        "mixtral-8x7b-32768".to_string()
    } else {
        model.to_string()
    }
}

pub fn map_xai_model(model: &str) -> String {
    let model_name = if model.starts_with("grok:") {
        model.strip_prefix("grok:").unwrap_or(model)
    } else {
        model
    };
    if model_name == "grok-4" || model_name == "grok-4-latest" {
        "grok-4-latest".to_string()
    } else {
        model_name.to_string()
    }
}

pub fn map_gemini_model(model: &str) -> String {
    if model.starts_with("gemini:") {
        let model_name = model.strip_prefix("gemini:").unwrap_or("gemini-2.5-flash");
        match model_name {
            "gemini-3-flash-preview" => "gemini-3-flash-preview",
            "gemini-2.5-flash" => "gemini-2.5-flash",
            "gemini-2.5-pro" => "gemini-2.5-pro",
            "gemini-1.5-flash" => "gemini-1.5-flash",
            "gemini-1.5-pro" => "gemini-1.5-pro",
            "gemini-pro" => "gemini-2.5-flash",
            _ => "gemini-2.5-flash",
        }
        .to_string()
    } else if model == "gemini" {
        "gemini-2.5-flash".to_string()
    } else {
        "gemini-2.5-flash".to_string()
    }
}

pub fn map_huggingface_model(model: &str) -> String {
    if model.starts_with("huggingface:") {
        model.strip_prefix("huggingface:").unwrap_or(model).to_string()
    } else {
        model.to_string()
    }
}

#[derive(Debug, Clone)]
pub struct ApiProviderConfig {
    pub endpoint: String,
    pub auth_header: String,
    pub auth_header_value: String,
    pub model_mapping: Option<fn(&str) -> String>,
}

pub fn get_api_provider_config(provider: &str) -> ApiProviderConfig {
    match provider {
        "openai" => ApiProviderConfig {
            endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
            auth_header: "Authorization".to_string(),
            auth_header_value: "Bearer".to_string(),
            model_mapping: None,
        },
        "anthropic" => ApiProviderConfig {
            endpoint: "https://api.anthropic.com/v1/messages".to_string(),
            auth_header: "x-api-key".to_string(),
            auth_header_value: "".to_string(),
            model_mapping: None,
        },
        "groq" => ApiProviderConfig {
            endpoint: "https://api.groq.com/openai/v1/chat/completions".to_string(),
            auth_header: "Authorization".to_string(),
            auth_header_value: "Bearer".to_string(),
            model_mapping: Some(map_groq_model),
        },
        "xai" => ApiProviderConfig {
            endpoint: "https://api.x.ai/v1/chat/completions".to_string(),
            auth_header: "Authorization".to_string(),
            auth_header_value: "Bearer".to_string(),
            model_mapping: Some(map_xai_model),
        },
        "gemini" => ApiProviderConfig {
            endpoint: "https://generativelanguage.googleapis.com/v1/models".to_string(),
            auth_header: "Content-Type".to_string(),
            auth_header_value: "application/json".to_string(),
            model_mapping: Some(map_gemini_model),
        },
        "huggingface" => ApiProviderConfig {
            endpoint: "https://api-inference.huggingface.co/models".to_string(),
            auth_header: "Authorization".to_string(),
            auth_header_value: "Bearer".to_string(),
            model_mapping: Some(map_huggingface_model),
        },
        _ => ApiProviderConfig {
            endpoint: "".to_string(),
            auth_header: "Authorization".to_string(),
            auth_header_value: "Bearer".to_string(),
            model_mapping: None,
        },
    }
}

pub fn detect_api_provider(model: &str) -> &'static str {
    if model.starts_with("gpt") {
        "openai"
    } else if model.starts_with("claude") {
        "anthropic"
    } else if model.starts_with("groq") || model.starts_with("llama") || model.starts_with("mixtral") {
        "groq"
    } else if model.starts_with("grok") {
        "xai"
    } else if model.starts_with("gemini") {
        "gemini"
    } else if model.starts_with("huggingface") || model.contains("/") {
        "huggingface"
    } else {
        "unknown"
    }
}

#[allow(dead_code)]
pub fn get_api_key_for_provider(provider: &str, api_keys: &std::collections::HashMap<String, String>) -> Option<String> {
    api_keys.get(provider).cloned()
}
