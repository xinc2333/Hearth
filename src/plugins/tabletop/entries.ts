// The 跑团 preset entries. They are ordinary preset entries the user can read and change; the marker on
// the first line tells 跑团 which step each one is for, and 跑团 takes them out of the ordinary prompt.
// These are the generic ones offered for any preset. An adapted preset may bring its own wording, and
// for presets that answer through tool calls also the `*-lead` entries: a line in the preset's own
// voice that comes right before each step.
//
//   <<<|hearth|ruling>>>    step 1, 裁定
//   <<<|hearth|narrate>>>   step 2, the reply
//   <<<|hearth|pass>>>      step 2 when 检定绝对通过 is on (instead of the checks)
//   <<<|hearth|settle>>>    step 3, 结算
//   <<<|hearth|ruling-lead>>>, <<<|hearth|narrate-lead>>>, <<<|hearth|pass-lead>>>, <<<|hearth|settle-lead>>>

export interface TabletopEntry {
    /** The step the entry is for (the marker). */
    kind: 'ruling' | 'narrate' | 'pass' | 'settle';
    name: string;
    content: string;
}

export const TABLETOP_ENTRIES: TabletopEntry[] = [
    {
        kind: 'ruling',
        name: '跑团·裁定说明',
        content: `<<<|hearth|ruling>>>
【DM 裁定】这一步先不写正文，只当裁判：判断这一轮主角的行动里，有哪些事结果说不准、需要掷骰，然后调用 hearth_check 提交。
- 只检定结果真正不确定、而且成败会让剧情走向不同的事。稳稳能做到的事、纯聊天、纯描写都不检定。
- 主角的行动要检定；其他角色对主角行动的反应、他们主动做的事也可以检定（例如守卫有没有察觉、她是不是在说谎）。主角察觉不到的检定设为暗骰（hidden: true）。
- 每个检定写清：谁（actor）、做什么（action）、为什么说不准（reason）、用哪项属性（attribute），涉及特长时写上 skill；和难度比（difficulty），或者和对手比（opponent）。
- 难度：简单 50、普通 100、困难 150、很难 200、极难 300，可以给中间值，含义是「属性要多高才有五成把握」。
- 环境加成写在 modifiers 里，每项写理由和倍率（例如 只有一根发卡 ×0.8、对方信任你 ×1.3、黑暗中 ×0.7）。社交检定要参考【对主角的态度】里的数值。
- 角色自己的属性由 Hearth 从跑团数据里查，不用你报。不在跑团数据里的角色，用 actor_value 或 opponent.value 写一个估计的有效值。
- 每个检定都要先写好四种结果各自会发生什么：大成功、成功、失败、大失败，各一两句。每种只写一个确定的情形：具体发生了什么、因为什么，不写「或者」「也许」让叙述去挑；道具、能力有没有用掉也写定。掷骰后只采用掷中的那一种，它就是事实。
- 一轮可以有多个检定。互不依赖的一次提交；后面的要看前面的结果才能决定时，先提交前面的并把 done 设为 false，拿到结果再提交后面的。
- 没有需要检定的事：checks 留空，done 设为 true。`,
    },
    {
        kind: 'narrate',
        name: '跑团·叙述说明',
        content: `<<<|hearth|narrate>>>
【写作要求】
- 正文必须和【本轮检定结果】一致：掷中的结果就是已经发生的事实，照着写成确定的经过，不要改写成别的结果，也不要用「兴许是……也兴许是……」把几种可能并列着写。
- 以主角的视角写。数值只是让剧情更真实的依据，正文里不要出现数字、属性名、「检定」「掷骰」这类字眼。
- 角色对主角的态度通过言行自然流露，不要直接说出来。爱和恨可以同时存在，按【对主角的态度】里的数值和缘由拿捏分寸。
- 主角自己的感受和决定由玩家来写，不要替主角决定他喜欢谁、恨谁。
- 暗骰的结果主角并不知道，只能通过主角看得到、听得到的表现体现。`,
    },
    {
        kind: 'settle',
        name: '跑团·结算说明',
        content: `<<<|hearth|settle>>>
【结算】刚才的回复已经写完。这一步不写正文，只当记账的 DM：回顾那段回复里发生的事，调用 hearth_settle 记下它造成的变化。
- 在场的每个角色都要过一遍：这段回复里的事，有没有让他对主角的亲近、怨恨、信任、敬重、畏惧、吸引、熟悉发生变化。没有变化就写 0。
- 变化的大小和事件的分量相称：寒暄、日常交流 0～2；留下印象的举动（帮了小忙、失礼、被看穿的小谎）3～8；明显的好意或冒犯（出手相助、当众顶撞、被戳穿的欺骗）8～15；重大事件（救命、背叛、表白、伤害）15～30。一件事可以同时牵动几条线。
- 只记录别人对主角的态度。主角自己的感情由玩家决定，不记录。
- 角色之间的关系有了变化（结仇、和好、起了疑心……），写在 bonds 里，用几个字写现在的关系。
- 受伤、醉酒、疲惫这类临时状态：新出现的加上，已经好了的去掉。
- 新登场、以后还会出现的角色，登记在 new_characters。
- 属性和特长只记长期的成长或衰退，很少发生。
- 每一项变化都要有这段回复里的事作为依据，reason 写清是哪件事；没发生的事不要编。`,
    },
    {
        kind: 'pass',
        name: '跑团·检定绝对通过说明',
        content: `<<<|hearth|pass>>>
【本轮检定】这一轮开启了「检定绝对通过」：不掷骰，主角的行动全部顺利完成，按顺利的结果写。`,
    },
];
