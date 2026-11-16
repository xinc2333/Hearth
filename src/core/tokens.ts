// Fast token estimate used for budgeting. CJK characters count roughly one token each; other text
// about 3.6 characters per token. Real tokenizers can be plugged in later via `countTokens`.

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/g;

export function estimateTokens(text: string): number {
    if (!text) {
        return 0;
    }
    const cjk = text.match(CJK)?.length ?? 0;
    const rest = text.length - cjk;
    return Math.ceil(cjk + rest / 3.6);
}

/** Per-message overhead of chat formats (role markers, separators). */
export const MESSAGE_OVERHEAD = 4;
