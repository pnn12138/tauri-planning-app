use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use std::sync::Mutex;

pub struct EmbeddingEngine {
    model: Mutex<TextEmbedding>,
}

impl EmbeddingEngine {
    pub fn new() -> Result<Self, anyhow::Error> {
        // Initialize with AllMiniLML6V2 which is a good balance of speed and quality
        let model = TextEmbedding::try_new(InitOptions::new(EmbeddingModel::AllMiniLML6V2))?;
        Ok(Self {
            model: Mutex::new(model),
        })
    }

    pub fn embed_documents(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, anyhow::Error> {
        let model = self.model.lock().unwrap();
        // Batch embedding
        let embeddings = model.embed(texts, None)?;
        Ok(embeddings)
    }

    pub fn cosine_similarity(vec1: &[f32], vec2: &[f32]) -> f32 {
        let dot_product: f32 = vec1.iter().zip(vec2).map(|(a, b)| a * b).sum();
        let magnitude1: f32 = vec1.iter().map(|x| x * x).sum::<f32>().sqrt();
        let magnitude2: f32 = vec2.iter().map(|x| x * x).sum::<f32>().sqrt();

        if magnitude1 == 0.0 || magnitude2 == 0.0 {
            return 0.0;
        }

        dot_product / (magnitude1 * magnitude2)
    }
}
