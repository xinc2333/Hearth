import type { Preset } from '../core/types.ts';

export const SOURCE_LABELS: Record<string, string> = {
    main: '主提示词',
    nsfw: '辅助提示词',
    jailbreak: '后置指令',
    enhanceDefinitions: '增强定义',
    worldInfoBefore: '世界书（角色前）',
    worldInfoAfter: '世界书（角色后）',
    charDescription: '角色描述',
    charPersonality: '角色性格',
    scenario: '场景',
    personaDescription: '用户角色',
    dialogueExamples: '示例对话',
    newMainChat: '对话开始标记',
    newChat: '示例开始标记',
    DEPTH_PROMPT: '角色备注（深度注入）',
    '2_floating_prompt': '作者注释',
    authorsNote: '作者注释',
    catgodMode: '猫神聊天模式',
    catgodDeepThink: '猫神深度思考',
    catgodNote: '猫神临时纸条',
    cardEditor: 'AI 编辑卡片',
    PERSONA_DESCRIPTION: '用户角色（深度注入）',
    continueNudge: '继续提示',
    continuePrefill: '续写内容',
    impersonate: '代写提示',
    quietPrompt: '后台指令',
    emptyUserMessageReplacement: '空消息替代',
};

export function sourceLabel(id: string, preset: Preset | null): string {
    if (id.startsWith('chat:')) return '聊天记录';
    if (id.startsWith('chatHistory-')) return '聊天记录';
    const depth = id.match(/^customDepthWI_(\d+)_(\d)$/);
    if (depth) return `世界书（深度 ${depth[1]}）`;
    if (id.startsWith('customWIOutlet_')) return `世界书出口 ${id.slice(15)}`;
    if (SOURCE_LABELS[id]) return SOURCE_LABELS[id];
    const p = preset?.prompts.find(x => x.id === id);
    return p?.name || id;
}
