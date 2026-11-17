// 数据化适配: a 编辑-mode task that has the AI build the card's 跑团 sheet. The sheet is written in
// the usual <card_edit> block under its own address:
//   【改写】跑团角色表      (YAML; listed characters and relations replace the same ones)
//   【删除】跑团角色表 › 林晚

import type { Op } from '../../core/ops.ts';
import type { EditTask, EditTaskContext } from '../../server/plugins.ts';
import { attributeGuide } from './text.ts';
import { DIFFICULTIES, LEVELS, PROTAGONIST, SKILL_LEVELS } from './rules.ts';
import { cardSheet, emptySheet, mergeSheet, parseSheetPatch, removeCharacter, sheetToYaml, type Sheet } from './sheet.ts';

export const ADDRESS = '跑团角色表';
const REQUEST = '请为这张卡做跑团数据化适配：通读角色卡和世界书，为主角和所有重要角色建立角色表（属性、特长、性格系数、初始状态，每项附原文依据），并写出他们之间、以及他们对主角的初始态度。';
const RELEVANT = /跑团|数据化|角色表|属性|态度|特长|性格系数/;

const EXAMPLE = `【改写】${ADDRESS}
角色:
  ${PROTAGONIST}:
    属性: { 力量: 95, 敏捷: 120, 体质: 100, 感知: 115, 智力: 125, 意志: 105, 魅力: 110, 口才: 130 }
    特长: { 开锁: 精通, 剑术: 入门 }
    性格: { 敏感: 1, 记仇: 1, 多疑: 1 }
    依据: 开场白写主角是锁匠学徒，「手比脑子快」
  林晚:
    别名: [晚晚]
    属性: { 力量: 70, 敏捷: 135, 体质: 90, 感知: 140, 智力: 120, 意志: 150, 魅力: 160, 口才: 105 }
    特长: { 剑术: 熟练 }
    性格: { 敏感: 1.3, 记仇: 1.8, 多疑: 1.5 }
    状态:
      - { 名称: 旧伤未愈, 影响: { 体质: 0.8 }, 说明: 左肩的刀伤还没好 }
    依据: 设定写她「自幼习剑」「记仇，一笔一笔都记着」
态度:
  - { 从: 林晚, 对: ${PROTAGONIST}, 亲近: 60, 怨恨: 55, 信任: 25, 敬重: 40, 畏惧: 0, 吸引: 45, 熟悉: 85, 缘由: [三年前主角不告而别] }
  - { 从: ${PROTAGONIST}, 对: 林晚, 亲近: 75, 怨恨: 0, 信任: 60, 敬重: 50, 畏惧: 5, 吸引: 60, 熟悉: 85 }`;

function wanted(ctx: EditTaskContext): boolean {
    if (cardSheet(ctx.character)) return true;
    const recent = ctx.messages.filter(m => m.mode === 'edit' && m.role === 'user').slice(-8);
    return recent.some(m => RELEVANT.test(m.swipes[m.activeSwipe]?.content ?? ''));
}

export function instruction(ctx: EditTaskContext): string {
    if (!wanted(ctx)) return '';
    const sheet = cardSheet(ctx.character);
    const persona = ctx.persona?.description?.trim();
    return [
        '# 跑团角色表（数据化适配）',
        '',
        `用户要求数据化适配、或要修改跑团角色表时，在 <card_edit> 块里用地址「${ADDRESS}」写 YAML。用户扮演的角色在表里固定叫「${PROTAGONIST}」（故事里的名字是「${ctx.userName}」）。`,
        '',
        '## 规则',
        `- 属性：${attributeGuide()}。普通成年男性 = 100，按倍数理解（200 就是普通人的两倍）。参照：${LEVELS.map(([v, w]) => `${v} ${w}`).join('｜')}｜300 以上 超出人类。`,
        '- 照参照表打分，并按卡片的描写拉开差距：同一个人的属性要有高有低，女性、孩子、老人、非人生物按实际情况估计，不要都写成 100。',
        '- 卡片世界里普通人没有的能力（魔力、灵力、异能等）写在「自定义属性」里，写明「说明」和「基准」（100 代表这个世界里什么水平），再在角色的属性里打分。',
        `- 特长：档位只能是 ${Object.keys(SKILL_LEVELS).join('、')}，检定时分别乘以 ${Object.values(SKILL_LEVELS).join('、')}。只写角色真正擅长的。`,
        '- 性格系数（0.5～2，默认 1）：敏感（态度变化的幅度）、记仇（怨恨消退的快慢，越大越慢）、多疑（越大信任越难建立、越容易失去）。',
        '- 状态：开局就有的伤病、醉酒、疲惫等，可以带属性倍率（如 体质: 0.8）。',
        '- 态度有方向，A 对 B 和 B 对 A 分开写。六条线：亲近、怨恨、信任、敬重、畏惧、吸引，各 0～100，互不抵消，爱和恨可以同时很高；另有熟悉 0～100。缘由写形成这份态度的往事。至少写清主要角色对主角、主角对主要角色的态度。',
        `- 难度参考（之后的检定会用到）：${DIFFICULTIES.map(([w, v]) => `${w} ${v}`).join('、')}。`,
        `- 主角的设定来自卡片对 {{user}} 的描写${persona ? '和下面的用户角色设定' : ''}；卡片没写的，按普通成年人估计。`,
        '- 依据：每个角色写一两句，引用卡片或世界书的原文说明数值从何而来。',
        '',
        '## 写法',
        `- 【改写】${ADDRESS}：只有写到的部分会变。属性、特长、性格按项合并（只写要改的那几项即可），状态、别名、依据写了就整体替换；态度按「从、对」找到同一对关系，只改写到的线。没写到的角色和关系保持不变。`,
        `- 【删除】${ADDRESS} › 角色名：删除这个角色和与他有关的态度。`,
        '- 不要改动卡片和世界书里的其他内容，除非用户也要求了。',
        '',
        '示例：',
        '```',
        EXAMPLE,
        '```',
        ...(persona ? ['', `## 用户角色「${ctx.userName}」的设定`, persona] : []),
        '',
        '## 当前的跑团角色表',
        sheet ? `\`\`\`yaml\n${sheetToYaml(sheet)}\n\`\`\`` : '（还没有）',
    ].join('\n');
}

function write(next: Sheet): Op[] {
    return [{ op: 'set', path: ['extra', 'hearth', 'rpg'], value: next }];
}

export const adaptTask: EditTask = {
    id: 'adapt',
    label: '数据化适配',
    hint: '让 AI 通读卡片，建立跑团角色表（属性、特长、态度）',
    request: REQUEST,
    address: ADDRESS,
    instruction,
    apply(op, ctx) {
        const current = cardSheet(ctx.character);
        const before = current ? sheetToYaml(current) : '';
        if (op.action === '删除') {
            if (!op.path.length) throw new Error('请写明要删除哪个角色，例如「跑团角色表 › 林晚」');
            if (!current) throw new Error('这张卡还没有跑团角色表');
            const next = removeCharacter(current, op.path[0]);
            return { ops: write(next), label: `${ADDRESS} › ${op.path[0]}`, before, after: sheetToYaml(next) };
        }
        if (op.action !== '改写' && op.action !== '新增') throw new Error(`${ADDRESS}只支持【改写】和【删除】`);
        const { sheet: patch, given } = parseSheetPatch(op.body);
        const next = mergeSheet(current ?? emptySheet(), patch, given);
        const names = [...Object.keys(patch.characters), ...(patch.relations.length ? [`${patch.relations.length} 条态度`] : [])];
        return { ops: write(next), label: `${ADDRESS}${names.length ? `（${names.slice(0, 4).join('、')}${names.length > 4 ? ' 等' : ''}）` : ''}`, before, after: sheetToYaml(next) };
    },
};
