use crate::ipc::ApiError;
use crate::repo::settings_repo::AiSettings;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize, Debug)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize, Debug)]
struct ChatChoice {
    message: Message,
}

pub struct AiService {
    client: Client,
    settings: AiSettings,
}

impl AiService {
    pub fn new(client: Client, settings: AiSettings) -> Self {
        Self { client, settings }
    }

    pub async fn chat_completion(&self, messages: Vec<Message>) -> Result<String, ApiError> {
        let url = format!(
            "{}/chat/completions",
            self.settings.base_url.trim_end_matches('/')
        );

        let request_body = ChatCompletionRequest {
            model: self.settings.model_name.clone(),
            messages,
            temperature: Some(0.7), // Default temperature
        };

        let mut request_builder = self.client.post(&url).json(&request_body);

        if !self.settings.api_key.is_empty() {
            request_builder = request_builder
                .header("Authorization", format!("Bearer {}", self.settings.api_key));
        }

        let response = request_builder.send().await.map_err(|e| ApiError {
            code: "AiRequestFailed".to_string(),
            message: format!("Failed to send request to AI provider: {}", e),
            details: None,
        })?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(ApiError {
                code: "AiProviderError".to_string(),
                message: format!("AI provider returned error: {}", error_text),
                details: None,
            });
        }

        let response_body: ChatCompletionResponse =
            response.json().await.map_err(|e| ApiError {
                code: "AiParseFailed".to_string(),
                message: format!("Failed to parse AI response: {}", e),
                details: None,
            })?;

        if let Some(choice) = response_body.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err(ApiError {
                code: "AiEmptyResponse".to_string(),
                message: "AI provider returned no choices".to_string(),
                details: None,
            })
        }
    }
}
