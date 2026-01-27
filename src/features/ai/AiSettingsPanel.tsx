import React, { useEffect, useState } from 'react';
import { useAiStoreWithActions } from './ai.store';
import './ai.css';

/**
 * AI Settings Panel - appears as a right sidebar panel (not a modal)
 * Reference design: stitch_integrated_timeline_kanban_view (19)
 */
export const AiSettingsPanel: React.FC = () => {
    const {
        isSettingsOpen,
        setSettingsOpen,
        settings,
        updateSettings,
        isLoading,
        loadSettings,
        activeAgentId,
        personas,
        loadPersonas,
        setActiveAgent
    } = useAiStoreWithActions();
    const [provider, setProvider] = useState<'gemini' | 'openai' | 'ollama' | 'openrouter'>('gemini');
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [modelName, setModelName] = useState('');

    useEffect(() => {
        if (isSettingsOpen) {
            loadSettings();
            loadPersonas();
        }
    }, [isSettingsOpen]);

    useEffect(() => {
        setProvider(settings.provider);
        setBaseUrl(settings.base_url);
        setApiKey(settings.api_key);
        setModelName(settings.model_name);
    }, [settings]);

    // Auto-update base_url and model when provider changes
    useEffect(() => {
        if (provider === 'gemini') {
            setBaseUrl('https://generativelanguage.googleapis.com/v1beta');
            if (!modelName || modelName === 'qwen3:4b' || modelName === 'llama3' || modelName.startsWith('gpt')) {
                setModelName('gemini-pro');
            }
        } else if (provider === 'openai') {
            setBaseUrl('https://api.openai.com/v1');
            if (!modelName || modelName === 'qwen3:4b' || modelName === 'llama3' || modelName.startsWith('gemini')) {
                setModelName('gpt-4');
            }
        } else if (provider === 'ollama') {
            setBaseUrl('http://localhost:11434/v1');
            if (!modelName || modelName.startsWith('gpt') || modelName.startsWith('gemini')) {
                setModelName('qwen3:4b');
            }
        } else if (provider === 'openrouter') {
            setBaseUrl('https://openrouter.ai/api/v1');
            // If user switches to OpenRouter and key is empty, or matches known defaults, pre-fill it.
            // Note: In a real app we might not want to hardcode this, but per user request we are.
            if (!apiKey) {
                setApiKey('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');
            }
            if (!modelName || !modelName.includes('/')) {
                setModelName('google/gemini-2.0-flash-lite-preview-02-05:free');
            }
        }
    }, [provider]);

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
        <aside className="ai-settings-panel">
            {/* Header */}
            <div className="ai-settings-panel-header">
                <div className="ai-settings-panel-title">
                    <span className="ai-settings-icon">⚙️</span>
                    <span>AI 设置</span>
                </div>
                <button
                    className="ai-settings-close-btn"
                    onClick={() => setSettingsOpen(false)}
                    title="关闭"
                >
                    ×
                </button>
            </div>

            {/* Body */}
            <div className="ai-settings-panel-body">
                {/* Agent Selection */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">当前助手 (Agent)</label>
                    <select
                        className="ai-settings-select"
                        value={activeAgentId}
                        onChange={e => setActiveAgent(e.target.value)}
                    >
                        {personas.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <p className="ai-settings-hint">
                        {personas.find(p => p.id === activeAgentId)?.description || '选择一个助手'}
                    </p>
                </div>

                {/* Provider Selection */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">AI 服务商</label>
                    <div className="ai-settings-provider-tabs">
                        <button
                            className={`ai-provider-tab ${provider === 'gemini' ? 'active' : ''}`}
                            onClick={() => setProvider('gemini')}
                        >
                            🌟 Gemini
                        </button>
                        <button
                            className={`ai-provider-tab ${provider === 'openai' ? 'active' : ''}`}
                            onClick={() => setProvider('openai')}
                        >
                            ⚡ OpenAI
                        </button>
                        <button
                            className={`ai-provider-tab ${provider === 'ollama' ? 'active' : ''}`}
                            onClick={() => setProvider('ollama')}
                        >
                            🏠 Ollama
                        </button>
                        <button
                            className={`ai-provider-tab ${provider === 'openrouter' ? 'active' : ''}`}
                            onClick={() => setProvider('openrouter')}
                        >
                            🔗 OpenRouter
                        </button>
                    </div>
                </div>

                {/* Model Name */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">模型名称</label>
                    <input
                        type="text"
                        className="ai-settings-input"
                        list="ai-model-options"
                        value={modelName}
                        onChange={e => setModelName(e.target.value)}
                        placeholder="输入或选择模型名称"
                    />
                    <datalist id="ai-model-options">
                        {provider === 'gemini' && (
                            <>
                                <option value="gemini-pro" />
                                <option value="gemini-1.5-pro" />
                                <option value="gemini-1.5-flash" />
                            </>
                        )}
                        {provider === 'openai' && (
                            <>
                                <option value="gpt-4" />
                                <option value="gpt-4-turbo" />
                                <option value="gpt-3.5-turbo" />
                            </>
                        )}
                        {provider === 'ollama' && (
                            <>
                                <option value="qwen3:4b" />
                                <option value="llama3" />
                                <option value="qwen2.5" />
                                <option value="deepseek-r1" />
                            </>
                        )}
                        {provider === 'openrouter' && (
                            <>
                                <option value="google/gemini-2.0-flash-lite-preview-02-05:free" />
                                <option value="google/gemini-2.0-pro-exp-02-05:free" />
                                <option value="deepseek/deepseek-r1:free" />
                                <option value="anthropic/claude-3-opus" />
                                <option value="openai/gpt-4o" />
                            </>
                        )}
                    </datalist>
                    {provider === 'ollama' && (
                        <p className="ai-settings-hint">
                            💡 请确保已运行 <code>ollama serve</code>
                        </p>
                    )}
                </div>

                {/* API Endpoint */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">
                        API 端点
                        {provider === 'gemini' && ' (自动配置)'}
                    </label>
                    <input
                        type="text"
                        className="ai-settings-input"
                        value={baseUrl}
                        onChange={e => setBaseUrl(e.target.value)}
                        placeholder={
                            provider === 'ollama'
                                ? 'http://localhost:11434/v1'
                                : provider === 'openai'
                                    ? 'https://api.openai.com/v1'
                                    : provider === 'openrouter'
                                        ? 'https://openrouter.ai/api/v1'
                                        : 'https://generativelanguage.googleapis.com/v1beta'
                        }
                        disabled={provider === 'gemini'}
                    />
                </div>

                {/* API Key */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">
                        API Key {provider === 'ollama' && '(本地模型无需)'}
                    </label>
                    <div className="ai-settings-input-wrapper">
                        <input
                            type="password"
                            className="ai-settings-input"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder={
                                provider === 'ollama'
                                    ? '本地模型无需 API Key'
                                    : provider === 'openai'
                                        ? 'sk-...'
                                        : provider === 'openrouter'
                                            ? 'sk-or-...'
                                            : 'AIza...'
                            }
                        />
                        {provider === 'gemini' && apiKey && (
                            <button
                                className="ai-settings-clear-btn"
                                onClick={() => setApiKey('')}
                                title="清除"
                            >
                                🗑️
                            </button>
                        )}
                    </div>
                </div>

                {/* Connection Test */}
                <div className="ai-settings-field">
                    <label className="ai-settings-label">连接状态</label>
                    <div className="ai-settings-status">
                        <div className="ai-status-indicator-large"></div>
                        <span>未测试</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="ai-settings-panel-footer">
                <button
                    className="ai-settings-btn ai-settings-btn-secondary"
                    onClick={() => setSettingsOpen(false)}
                >
                    取消
                </button>
                <button
                    className="ai-settings-btn ai-settings-btn-primary"
                    onClick={handleSave}
                    disabled={isLoading}
                >
                    {isLoading ? '保存中...' : '保存设置'}
                </button>
            </div>
        </aside>
    );
};
