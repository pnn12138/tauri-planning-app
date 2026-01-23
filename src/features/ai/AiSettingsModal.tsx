import React, { useEffect, useState } from 'react';
import { useAiStoreWithActions } from './ai.store';
import './ai.css';

export const AiSettingsModal: React.FC = () => {
    const { isSettingsOpen, setSettingsOpen, settings, updateSettings, isLoading, loadSettings } = useAiStoreWithActions();
    const [provider, setProvider] = useState<'gemini' | 'openai' | 'ollama'>('gemini');
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [modelName, setModelName] = useState('');

    useEffect(() => {
        if (isSettingsOpen) {
            loadSettings();
        }
    }, [isSettingsOpen]);

    useEffect(() => {
        setProvider(settings.provider);
        setBaseUrl(settings.base_url);
        setApiKey(settings.api_key);
        setModelName(settings.model_name);
    }, [settings]);

    const handleSave = () => {
        updateSettings({
            provider,
            base_url: baseUrl,
            api_key: apiKey,
            model_name: modelName,
        });
    };

    if (!isSettingsOpen) return null;

    return (
        <div className="ai-modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="ai-modal" onClick={e => e.stopPropagation()}>
                <div className="ai-modal-header">
                    <div className="ai-modal-title">
                        <span className="material-symbols-outlined">settings_suggest</span>
                        AI Settings
                    </div>
                    <button className="ai-modal-close-btn" onClick={() => setSettingsOpen(false)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="ai-modal-body">
                    <div className="ai-field-group">
                        <label className="ai-label">AI Provider</label>
                        <select
                            className="ai-input"
                            value={provider}
                            onChange={e => setProvider(e.target.value as 'gemini' | 'openai' | 'ollama')}
                        >
                            <option value="gemini">Google Gemini</option>
                            <option value="openai">OpenAI</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                    </div>
                    <div className="ai-field-group">
                        <label className="ai-label">
                            Base URL {provider === 'gemini' && '(自动配置)'}
                        </label>
                        <input
                            className="ai-input"
                            value={baseUrl}
                            onChange={e => setBaseUrl(e.target.value)}
                            placeholder={
                                provider === 'ollama'
                                    ? "http://localhost:11434/v1"
                                    : provider === 'openai'
                                        ? "https://api.openai.com/v1"
                                        : "https://generativelanguage.googleapis.com/v1beta"
                            }
                            disabled={provider === 'gemini'}
                        />
                    </div>
                    <div className="ai-field-group">
                        <label className="ai-label">
                            API Key {provider === 'ollama' && '(本地模型无需)'}
                        </label>
                        <input
                            className="ai-input"
                            type="password"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder={
                                provider === 'ollama'
                                    ? "本地模型无需 API Key"
                                    : provider === 'openai'
                                        ? "sk-..."
                                        : "AIza..."
                            }
                        />
                    </div>
                    <div className="ai-field-group">
                        <label className="ai-label">Model Name</label>
                        <input
                            className="ai-input"
                            value={modelName}
                            onChange={e => setModelName(e.target.value)}
                            placeholder={
                                provider === 'ollama'
                                    ? "llama3"
                                    : provider === 'openai'
                                        ? "gpt-4"
                                        : "gemini-pro"
                            }
                        />
                    </div>
                </div>
                <div className="ai-modal-footer">
                    <button className="ai-btn ai-btn-secondary" onClick={() => setSettingsOpen(false)}>
                        Cancel
                    </button>
                    <button className="ai-btn ai-btn-primary" onClick={handleSave} disabled={isLoading}>
                        {isLoading ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
};
