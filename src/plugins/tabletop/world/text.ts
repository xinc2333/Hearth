// The world data each step gets (docs/world.md §11): facts the model writes from, picked for what
// the step needs. Instructions live in the preset's entries (entries.ts); this is only data.

import { KIND_LABEL, type City } from './city/index.ts';
import { ageWords, crowdWord, isOpen } from './scene.ts';
import type { TurnPlan } from './turn.ts';
import { PROTAGONIST } from '../rules.ts';
import {
    bodyWords, clock, dateKey, dayMatches, fmtNow, fmtWeather, isWorkday, minutesOf, moment, nearby, placeById,
    type Bystander, type Commitment, type WorldState,
} from './state.ts';

export type WorldStep = 'ruling' | 'narrate' | 'settle';

const km = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10} 米` : `${d.toFixed(1)} 公里`);

/** Today's and tomorrow's commitments for the protagonist, in time order. */
function agenda(world: WorldState, city: City): string[] {
    const out: { at: number; text: string }[] = [];
    const today = Math.floor(world.now / 1440) * 1440;
    for (const day of [today, today + 1440]) {
        for (const c of world.commitments as Commitment[]) {
            if (c.ended) continue;
            for (const e of c.expectations) {
                if (e.kind === 'presence' && e.who === PROTAGONIST && dayMatches(e.days, day)) {
                    const end = day + minutesOf(e.to);
                    if (end <= world.now) continue;
                    const when = day === today ? '今天' : '明天';
                    out.push({ at: day + minutesOf(e.from), text: `${when} ${e.from}–${e.to} 在${placeById(world, city, e.place)?.name ?? e.place}（${c.name}）` });
                } else if (e.kind === 'payment' && moment(day).d === e.day && day + 9 * 60 > world.now) {
                    const when = day === today ? '今天' : '明天';
                    out.push({ at: day + 9 * 60, text: `${when}${e.who === PROTAGONIST ? `要付 ${e.amount} 元给${e.to}` : `${e.who}会付 ${e.amount} 元`}（${c.name}）` });
                }
            }
        }
    }
    return out.sort((a, b) => a.at - b.at).map(x => x.text);
}

function personLine(p: Bystander): string {
    const who = p.name ? `${p.name}（${p.looks ?? ''}）` : p.looks ?? `${p.gender}，${ageWords(p.age)}`;
    return `- ${p.id}｜${p.where ?? '—'}｜${who}｜${p.doing ?? ''}${p.role === 'staff' ? '｜这里的工作人员' : ''}`;
}

/** The world as it stands, for one step. */
export function worldText(world: WorldState, city: City, step: WorldStep, plan?: TurnPlan): string {
    const place = placeById(world, city, world.at);
    const district = place ? city.districts.find(d => d.id === place.district)?.name ?? '' : '';
    const lines: string[] = ['【世界数据】下面是此刻的事实，正文和判断以此为准。'];
    lines.push(`时间：${fmtNow(world)}（${isWorkday(world.now) ? '工作日' : '休息日'}）　天气：${fmtWeather(world.weather[0])}`);
    if (place) {
        lines.push(`主角在：${district} ${place.name}（${KIND_LABEL[place.kind]}，${place.hours}${isOpen(place, world.now) ? '' : '，现在没营业'}）。${place.about}`);
        const near = nearby(world, city, place.at, 6, place.id).map(({ place: p, km: d }) => `${p.name}（${KIND_LABEL[p.kind]}，${km(d)}）`);
        lines.push(`附近：${near.join('、')}`);
    }
    const feel = bodyWords(world.body);
    lines.push(`主角：余额 ${world.balance} 元；${feel.length ? feel.join('、') : '身体状况正常'}；${world.me.job.kind === '无业' ? '没有工作' : `${world.me.job.title}`}`);
    const todo = agenda(world, city);
    if (todo.length) lines.push(`安排：${todo.join('；')}`);
    const unread = world.phone.messages.filter(m => !m.read && m.to === PROTAGONIST);
    if (unread.length) lines.push(`没看的消息：${unread.map(m => `${clock(m.at)} ${m.from}：${m.text}`).join('；')}`);

    if (plan && step !== 'ruling') {
        lines.push('', `【这一轮】从 ${clock(plan.from)} 写到 ${clock(plan.to)} 左右${plan.to - plan.from >= 1440 ? `（到 ${dateKey(plan.to)}）` : ''}。`);
        if (plan.move) lines.push(`路上：${plan.move.trip.legs.join('，')}，共 ${plan.move.trip.minutes} 分钟${plan.move.trip.cost ? `，${plan.move.trip.cost} 元` : ''}。`);
        const happened = plan.events.filter(e => e.kind !== 'move');
        if (happened.length) {
            lines.push('这段时间里的事：');
            for (const e of happened) lines.push(`- ${e.text}${e.seen ? '' : '（主角不知道，只能通过看得到、听得到的表现体现）'}`);
        }
    }
    if (world.scene && place && step !== 'ruling') {
        lines.push('', `【这里的人】${world.scene.crowd || crowdWord(place, world.now, world.weather[0])}。主角看得到的人：`);
        const people = world.scene.people;
        if (people.length) lines.push(...people.map(personLine));
        else lines.push('- 没有别人');
        if (step === 'narrate') lines.push('不知道名字的人，按看到的样子称呼。');
    }
    return lines.join('\n');
}

/** The scene step's data: the place and who the program put there. */
export function sceneText(world: WorldState, city: City, fresh: string[]): string {
    const place = placeById(world, city, world.at);
    const people = world.scene?.people ?? [];
    const lines = [
        `【场景】${fmtNow(world)}，${fmtWeather(world.weather[0])}。`,
        place ? `地点：${city.districts.find(d => d.id === place.district)?.name ?? ''} ${place.name}（${KIND_LABEL[place.kind]}）。${place.about}人流：${crowdWord(place, world.now, world.weather[0])}。` : '',
        '要写的人（按编号逐个写）：',
        ...people.filter(p => fresh.includes(p.id)).map(p => `- ${p.id}：${p.role === 'staff' ? `这里的${p.purpose}` : `来这里的${p.purpose}`}，${p.gender}，看起来${ageWords(p.age)}`),
    ];
    const known = people.filter(p => !fresh.includes(p.id) && p.looks);
    if (known.length) lines.push('已经在场、写过的人（不用再写，保持一致）：', ...known.map(personLine));
    return lines.filter(Boolean).join('\n');
}

/** The opening's data: what the player wrote, and what the map offers. */
export function setupText(form: { name: string; gender?: string; age?: number; job: string; jobText?: string; district?: string; about?: string; start?: string }, choices: string): string {
    return [
        '【开局设定】',
        `主角：${form.name}${form.gender ? `，${form.gender}` : ''}${form.age ? `，${form.age} 岁` : ''}`,
        `职业：${form.job}${form.jobText ? `，${form.jobText}` : ''}`,
        form.district ? `想住在：${form.district}` : '住在哪：按职业和收入挑合适的区',
        form.about ? `关于主角：${form.about}` : '',
        `开始的时间：${form.start || '2026-03-02 07:30'}`,
        '',
        '【澜江市可选的地方】',
        choices,
    ].filter(Boolean).join('\n');
}

export { ageWords };
