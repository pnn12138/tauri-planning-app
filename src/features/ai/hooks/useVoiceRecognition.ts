import { useState, useEffect, useRef, useCallback } from 'react';

type VoiceState = 'idle' | 'listening' | 'error' | 'stopped';

interface UseVoiceRecognitionOptions {
    lang?: string;
    continuous?: boolean;
    interimResults?: boolean;
}

interface UseVoiceRecognitionReturn {
    // 状态
    isListening: boolean;
    isSupported: boolean;
    error: string | null;

    // 识别结果
    interimTranscript: string;  // 实时预览（不确定）
    finalTranscript: string;    // 最终确认文本

    // 控制
    startListening: () => void;
    stopListening: () => void;
    clearTranscript: () => void; // 取消本次识别
}

/**
 * 获取默认语言设置（基于浏览器语言）
 */
const getDefaultLanguage = (): string => {
    const navLang = navigator.language || 'zh-CN';

    if (navLang.startsWith('zh')) return 'zh-CN';
    if (navLang.startsWith('en')) return 'en-US';
    if (navLang.startsWith('ja')) return 'ja-JP';

    return 'zh-CN'; // 默认中文
};

/**
 * 语音识别 Hook
 * 
 * 使用 Web Speech API 实现语音识别功能
 * 
 * @param options - 配置选项
 * @returns 语音识别状态和控制方法
 */
export function useVoiceRecognition(
    options: UseVoiceRecognitionOptions = {}
): UseVoiceRecognitionReturn {
    const {
        lang = getDefaultLanguage(),
        continuous = false,  // 短句模式，适合聊天输入
        interimResults = true,  // 启用实时预览
    } = options;

    const [state, setState] = useState<VoiceState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [interimTranscript, setInterimTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');

    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // 检测浏览器是否支持 Web Speech API
    const isSupported = typeof window !== 'undefined' &&
        (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

    /**
     * 初始化 SpeechRecognition 实例
     */
    useEffect(() => {
        if (!isSupported) {
            setError('您的浏览器不支持语音识别功能');
            setState('error');
            return;
        }

        try {
            // 支持 webkit 前缀（Safari）
            const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognitionAPI();

            // 配置识别器
            recognition.continuous = continuous;
            recognition.interimResults = interimResults;
            recognition.lang = lang;
            recognition.maxAlternatives = 1;

            // === 事件处理 ===

            // 开始录音
            recognition.onstart = () => {
                console.log('[Voice] Recognition started');
                setState('listening');
                setError(null);
            };

            // 识别结果
            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let interim = '';
                let final = '';

                // 遍历所有结果
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;

                    if (result.isFinal) {
                        final += transcript;
                    } else {
                        interim += transcript;
                    }
                }

                // 更新状态
                if (interim) {
                    setInterimTranscript(interim);
                }
                if (final) {
                    console.log('[Voice] Final transcript:', final);
                    setFinalTranscript(final);
                    setInterimTranscript(''); // 清空临时文本
                }
            };

            // 错误处理
            recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('[Voice] Recognition error:', event.error);

                let errorMessage = '';

                switch (event.error) {
                    case 'not-allowed':
                        errorMessage = '麦克风权限被拒绝，请在系统设置中允许应用访问麦克风';
                        break;
                    case 'no-speech':
                        errorMessage = '没有检测到语音，请重试';
                        break;
                    case 'audio-capture':
                        errorMessage = '无法访问麦克风，请检查设备连接';
                        break;
                    case 'network':
                        errorMessage = '网络错误，语音识别需要网络连接';
                        break;
                    case 'aborted':
                        // 用户主动停止，不显示错误
                        errorMessage = '';
                        break;
                    default:
                        errorMessage = `识别错误：${event.error}`;
                }

                if (errorMessage) {
                    setError(errorMessage);
                    setState('error');
                }
            };

            // 识别结束（自动触发或手动停止）
            recognition.onend = () => {
                console.log('[Voice] Recognition ended');
                setState('stopped');
                setInterimTranscript(''); // 清空临时文本
            };

            // 没有匹配结果
            recognition.onnomatch = () => {
                console.warn('[Voice] No match found');
                setError('没听清，请重试');
            };

            recognitionRef.current = recognition;
        } catch (err) {
            console.error('[Voice] Failed to initialize recognition:', err);
            setError('语音识别初始化失败');
            setState('error');
        }

        // 清理
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch (e) {
                    // ignore
                }
            }
        };
    }, [isSupported, lang, continuous, interimResults]);

    /**
     * 开始录音
     */
    const startListening = useCallback(() => {
        if (!recognitionRef.current) {
            setError('语音识别未初始化');
            return;
        }

        if (state === 'listening') {
            console.warn('[Voice] Already listening');
            return;
        }

        try {
            // 重置状态
            setError(null);
            setInterimTranscript('');
            setFinalTranscript('');

            recognitionRef.current.start();
        } catch (err) {
            console.error('[Voice] Failed to start recognition:', err);
            setError('无法启动语音识别');
        }
    }, [state]);

    /**
     * 停止录音
     */
    const stopListening = useCallback(() => {
        if (!recognitionRef.current) return;

        if (state !== 'listening') {
            console.warn('[Voice] Not listening');
            return;
        }

        try {
            recognitionRef.current.stop();
        } catch (err) {
            console.error('[Voice] Failed to stop recognition:', err);
        }
    }, [state]);

    /**
     * 清空识别结果
     */
    const clearTranscript = useCallback(() => {
        setInterimTranscript('');
        setFinalTranscript('');
    }, []);

    return {
        isListening: state === 'listening',
        isSupported,
        error,
        interimTranscript,
        finalTranscript,
        startListening,
        stopListening,
        clearTranscript,
    };
}
