// The 「澜江市」 character card: what a 世界 chat runs on. Its description is the city overview,
// which never changes, so it sits in the part of the request that caching reuses. The card has no
// greeting: a new chat starts with the opening (docs/world.md §3).

import { lanjiang } from './city/index.ts';

export const WORLD_TAG = '世界';
export const WORLD_CARD_NAME = '澜江市';

/** The city overview for the card (about 800 characters). */
export function cityOverview(): string {
    const city = lanjiang();
    return [
        '澜江市是中国东部沿海的一座特大城市，常住人口约 620 万。东临东海，北临沧江入海口，南临南湾，地势平坦，只有西南的西山有几座百米左右的小山。',
        '澜江从西边的云湖流出，向东再折向北，穿过市中心汇入沧江口，把城市分成江西和江东。青溪自西向东穿过江西的老城区，在江滩汇入澜江。',
        `全市有 ${city.districts.length} 个区：`,
        ...city.districts.map(d => `- ${d.name}：${d.about}`),
        '交通：内环、中环、外环三条环路，外环以内是中心城区；8 条地铁和 1 条市域铁路，5:30 到 23:00 运营；过江有大桥、隧道和轮渡。西站枢纽是高铁站和西郊机场，东部机场在江东区的海边。',
        '气候是亚热带季风：春天多雨，六七月梅雨，夏天闷热、偶有台风，冬天湿冷。物价、工资和房租和国内一线城市相当，房租从市中心往外递减。',
    ].join('\n');
}

/** The card as a SillyTavern card file, for importing. */
export function worldCardJson(): Record<string, unknown> {
    const description = cityOverview();
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        name: WORLD_CARD_NAME,
        description,
        first_mes: '',
        data: {
            name: WORLD_CARD_NAME,
            description,
            personality: '',
            scenario: '',
            first_mes: '',
            mes_example: '',
            creator_notes: 'Hearth 自带的世界：在澜江市里过日子。新建对话时先设定主角。',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [WORLD_TAG],
            creator: 'Hearth',
            character_version: '1',
            extensions: { hearth: { world: 1 } },
        },
    };
}
