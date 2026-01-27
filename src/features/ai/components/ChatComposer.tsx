import React, { useRef, useEffect } from 'react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';

export interface ChatComposerProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    disabled?: boolean;          // AI 正在生成时（如果提供了 isGenerating 则该属性主要控制输入框）
    placeholder?: string;
    mode?: 'panel' | 'view';     // 控制样式差异
    isGenerating?: boolean;      // 新增：明确指示正在生成中
    onStop?: () => void;         // 新增：停止生成的回调
}

/**
 * 聊天输入组件
 * 
 * 统一管理输入逻辑，集成语音识别功能
 * - 输入框为空时显示🎤语音按钮
 * - 输入有内容时显示📤发送按钮
 * - 正在生成时显示⏹️停止按钮
 */
export default function ChatComposer({
    value,
    onChange,
    onSend,
    disabled = false,
    placeholder = '发送消息...',
    mode = 'panel',
    isGenerating = false,
    onStop,
}: ChatComposerProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        isListening,
        isSupported,
        error: voiceError,
        interimTranscript,
        finalTranscript,
        startListening,
        stopListening,
        clearTranscript,
    } = useVoiceRecognition();

    // 按钮状态：输入框为空且未禁用且非生成中时显示语音按钮
    // 优先级：
    // 1. isGenerating -> 显示停止按钮
    // 2. hasValue -> 显示发送按钮
    // 3. noValue -> 显示语音按钮
    const showStopButton = isGenerating && onStop;
    const showVoiceButton = !showStopButton && value.trim() === '' && !disabled;

    /**
     * 识别结束后写入 textarea
     */
    useEffect(() => {
        if (finalTranscript) {
            if (value.trim() === '') {
                // 空输入框：直接填入
                onChange(finalTranscript);
            } else {
                // 非空：追加（带空格）
                onChange(value + ' ' + finalTranscript);
            }
            clearTranscript();

            // 聚焦输入框
            textareaRef.current?.focus();
        }
    }, [finalTranscript, value, onChange, clearTranscript]);

    /**
     * Esc 取消录音
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isListening) {
                e.preventDefault();
                stopListening();
                clearTranscript();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isListening, stopListening, clearTranscript]);

    /**
     * 处理输入框按键
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !disabled && !isGenerating) {
                onSend();
            }
        }
    };

    /**
     * 切换语音识别状态
     */
    const toggleVoiceRecognition = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // 样式类名
    const containerClass = mode === 'panel' ? 'ai-panel-input-container' : 'ai-chat-input-container';
    const formClass = mode === 'panel' ? 'ai-panel-form' : 'ai-chat-form';
    const inputClass = mode === 'panel' ? 'ai-panel-input' : 'ai-chat-input';
    const sendBtnClass = mode === 'panel' ? 'ai-panel-send' : 'ai-chat-send';

    return (
        <div className={containerClass}>
            <div className="chat-composer">
                {/* 实时预览条（录音中显示） */}
                {isListening && interimTranscript && (
                    <div className="voice-preview">
                        <span className="voice-preview-label">正在聆听…</span>
                        <span className="voice-preview-text">{interimTranscript}</span>
                    </div>
                )}

                {/* 输入框 + 按钮 */}
                <form onSubmit={(e) => { e.preventDefault(); onSend(); }} className={formClass}>
                    <textarea
                        ref={textareaRef}
                        className={inputClass}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={disabled || isGenerating}
                    />

                    {/* 按钮切换：停止 / 语音识别 / 发送 */}
                    {showStopButton ? (
                        <button
                            type="button"
                            className={`${sendBtnClass} ai-stop-btn`}
                            onClick={onStop}
                            title="停止生成"
                        >
                            ⏹️
                        </button>
                    ) : showVoiceButton ? (
                        <button
                            type="button"
                            className={`ai-voice-btn ${isListening ? 'is-listening' : ''}`}
                            onClick={toggleVoiceRecognition}
                            disabled={disabled || (!isSupported && !isListening)}
                            title={isListening ? '点击停止录音（或按 Esc）' : '点击开始语音输入'}
                        >
                            {isListening ? '🔴' : '🎤'}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className={sendBtnClass}
                            disabled={!value.trim() || disabled}
                            title="发送消息（或按 Enter）"
                        >
                            {disabled ? '⏳' : '📤'}
                        </button>
                    )}
                </form>

                {/* 错误提示 */}
                {voiceError && !isListening && (
                    <div className="voice-error">
                        {voiceError}
                    </div>
                )}

                {/* 不支持语音识别提示 */}
                {!isSupported && value.trim() === '' && (
                    <div className="voice-error">
                        您的浏览器不支持语音识别功能
                    </div>
                )}
            </div>
        </div>
    );
}
