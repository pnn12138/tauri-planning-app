use crate::features::ai::embedding::EmbeddingEngine;
use tauri::State;

#[tauri::command]
pub async fn ai_generate_embeddings(
    texts: Vec<String>,
    engine: State<'_, EmbeddingEngine>,
) -> Result<Vec<Vec<f32>>, String> {
    engine.embed_documents(texts).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_search_similar(
    query: String,
    candidates: Vec<String>,
    engine: State<'_, EmbeddingEngine>,
) -> Result<Vec<(String, f32)>, String> {
    // 1. Embed query
    let query_embedding_res = engine.embed_documents(vec![query.clone()]);
    let query_embedding = match query_embedding_res {
        Ok(v) => v.first().ok_or("No embedding generated")?.clone(),
        Err(e) => return Err(e.to_string()),
    };

    // 2. Embed candidates (Note: This is expensive if many candidates.
    // In production, candidates should be pre-embedded.)
    let candidate_embeddings = engine
        .embed_documents(candidates.clone())
        .map_err(|e| e.to_string())?;

    let mut results: Vec<(String, f32)> = candidates
        .into_iter()
        .zip(candidate_embeddings.into_iter())
        .map(|(text, emb)| {
            let score = EmbeddingEngine::cosine_similarity(&query_embedding, &emb);
            (text, score)
        })
        .collect();

    // Sort descending by score
    results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    Ok(results)
}
