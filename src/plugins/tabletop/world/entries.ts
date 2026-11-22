// The 世界 preset entries (docs/world.md §11). Like the 跑团 entries they are ordinary preset entries
// the user can read and change; the marker on the first line says which step each one is for, and
// 跑团 takes them out of the ordinary prompt. These are the generic ones; an adapted preset can bring
// its own wording and a `*-lead` line in its own voice for each.

export interface WorldEntry {
    kind: 'world-ruling' | 'world-scene' | 'world-narrate' | 'world-settle' | 'world-setup' | 'world-opening';
    name: string;
    content: string;
}

export const WORLD_ENTRIES: WorldEntry[] = [
    {
        kind: 'world-ruling',
        name: '世界·裁定补充',
        content: `<<<|hearth|world-ruling>>>
【这一轮的时间和去向】裁定时同时在 hearth_check 里写：
- time.minutes：这一轮在原地或目的地做这些事要多少分钟。寒暄几句 2～5 分钟，吃一顿饭 30～60 分钟，最多 180。路上的时间不用算，Hearth 按地图算。
- 主角要去别处时写 move：to 写地图上的地点名，或者「家」「公司」；地图上没有的地方写一个具体的名字。by 写怎么去，不写就按主角的习惯。一起走的角色写在 with。
- 主角睡觉或玩家说要跳过一段时间时，写 time.until（明确的结束时刻）；照常过日子（上班、回家）时把 time.routine 设为 true。activity 写这段时间主要在做什么。
- 时间和去向只按玩家这一轮写的行动来定，不替主角多做别的事。`,
    },
    {
        kind: 'world-scene',
        name: '世界·场景说明',
        content: `<<<|hearth|world-scene>>>
【场景】这一步不写正文，只描写主角此刻看到的人，调用 hearth_scene 提交。
- 按给出的编号逐个写，每人一项：looks 写看起来的样子（大概的年纪、性别、身材、穿着、显眼的特征），doing 写在做什么，where 写在这里的哪个位置。
- 只写主角看得到的：不写名字、职业、身份和心里在想什么，可以写能看出来的东西（比如穿着工装、胸前挂着工牌）。
- 穿着要合季节、天气和场合；人和人之间要有差别，不要个个都好看或都很特别，大多数是普通人。
- crowd 用一句话写这里整体的样子和人流。`,
    },
    {
        kind: 'world-narrate',
        name: '世界·叙述补充',
        content: `<<<|hearth|world-narrate>>>
【世界】
- 按【世界数据】写：时间、天气、地点、路上的情况和【这一轮】里发生的事都以它为准，正文写到这一轮的结束时刻左右。
- 【这里的人】是主角此刻看得到的人，用主角的眼睛写出来：主角注意到谁、看到他们什么样子。不知道名字的人按样子称呼，不替他们编名字。
- 主角不知道的事，只能通过主角看得到、听得到的表现体现。
- 时间和钱可以自然地写（「快九点了」「打车花了三十多」），不写属性和身体的数值。主角饿了、困了，通过感受写出来。
- 只写到主角需要做决定的地方，不替主角做决定。`,
    },
    {
        kind: 'world-settle',
        name: '世界·结算补充',
        content: `<<<|hearth|world-settle>>>
【世界的记账】在 hearth_settle 的 world 里写这段回复里主角这边发生的事：
- 额外的花销和收入（三餐日用每天已经按生活水平扣过，车费已经算过，都不要再写）。主角吃了东西写 ate。
- 新答应、约好的事写 commitments，有具体时间就写 at，有地点就写 place；做完了的约定写 done。
- 主角用手机发出的消息写 messages；交换了联系方式写 contacts。
- 【这里的人】里和主角打过交道的人写 met（编号和称呼，问到名字就写名字）。
- 在场的角色去了别处写 moves；正文里出现、地图上没有的地点写 places。
- 正文比计划的时间段多写了时间（睡着了、聊过了头），写 extra_minutes。
- 只记这段回复里真的发生的事，没发生的不要编。`,
    },
    {
        kind: 'world-setup',
        name: '世界·开局说明',
        content: `<<<|hearth|world-setup>>>
【开局】这一步不写正文，只按【开局设定】把主角在澜江市的生活落成数据，调用 hearth_setup 提交。
- 一切按现实中国大城市的常理来：收入、房租、存款和职业、年纪、住的区相称；上班族的工资按这类工作在大城市的水平，房租离市中心越近越贵。
- 主角的属性按参照表打分（普通成年男性 100），特长只写真有的。
- 住处和单位优先从【澜江市可选的地方】里挑；没有合适的，写一个新名字，并在 near 写附近的已知地点。
- 单位的惯例（考勤、迟到、请假、加班）写得像一家真实的单位，有松有紧。
- 身边的人：上班族写上司和两位同事，学生写辅导员和两位同学，租房的写房东，再写一两位家人。每人写清和主角的关系、性格和对主角现在的态度，不要都很友好，也不要都很极端。`,
    },
    {
        kind: 'world-opening',
        name: '世界·开场说明',
        content: `<<<|hearth|world-opening>>>
【开场】这是故事的第一段。从【世界数据】里的时间和地点写起：主角此刻在哪、在做什么、周围是什么样，带出主角今天的安排。写到主角可以开始行动的地方停下，不替主角做决定。`,
    },
];
