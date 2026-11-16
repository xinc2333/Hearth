// Message rendering: display-only regex → markdown → sanitized HTML. Full HTML documents in code
// blocks (status panels, "frontend cards") are split out and rendered in sandboxed iframes.

import DOMPurify from 'dompurify';
import { Marked } from 'marked';

import { createMacroContext, evaluateMacros } from '../core/macros.ts';
import { applyRegex } from '../core/regex.ts';
import type { RegexPlacement, RegexScript } from '../core/types.ts';

const marked = new Marked({ gfm: true, breaks: true });

export type Segment = { type: 'html'; html: string } | { type: 'frame'; html: string };

export function displayText(text: string, opts: { regex: RegexScript[]; user: string; char: string; placement: RegexPlacement; depth: number }): string {
    if (!opts.regex.length) return text;
    const ctx = createMacroContext({ user: opts.user, char: opts.char });
    return applyRegex(opts.regex, text, opts.placement, {
        isDisplay: true,
        depth: opts.depth,
        macros: (t, transform) => evaluateMacros(t, ctx, { transform }),
    });
}

const FENCE = /```[^\n`]*\n([\s\S]*?)```/g;
const isDocument = (code: string) => /<(?:!doctype|html|body)[\s>]/i.test(code);

function decorateQuotes(html: string): string {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.parentElement?.closest('code, pre, a') && /["“「]/.test(node.data)) nodes.push(node);
    }
    for (const node of nodes) {
        const parts = node.data.split(/("[^"\n]+"|“[^”\n]+”|「[^」\n]+」)/);
        if (parts.length < 2) continue;
        const frag = document.createDocumentFragment();
        parts.forEach((part, i) => {
            if (i % 2) {
                const q = document.createElement('span');
                q.className = 'quote';
                q.textContent = part;
                frag.append(q);
            } else if (part) {
                frag.append(part);
            }
        });
        node.replaceWith(frag);
    }
    return tpl.innerHTML;
}

function toHtml(markdown: string): string {
    const raw = marked.parse(markdown, { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, {
        ADD_TAGS: ['details', 'summary'],
        FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button'],
        FORBID_ATTR: ['style'],
    });
    return decorateQuotes(clean);
}

export function renderSegments(text: string): Segment[] {
    const segments: Segment[] = [];
    let last = 0;
    for (const m of text.matchAll(FENCE)) {
        if (!isDocument(m[1])) continue;
        const before = text.slice(last, m.index);
        if (before.trim()) segments.push({ type: 'html', html: toHtml(before) });
        segments.push({ type: 'frame', html: m[1] });
        last = (m.index ?? 0) + m[0].length;
    }
    const rest = text.slice(last);
    if (rest.trim() || !segments.length) segments.push({ type: 'html', html: toHtml(rest) });
    return segments;
}

export interface FrameVars {
    message: Record<string, unknown>;
    chat: Record<string, unknown>;
    global: Record<string, unknown>;
    messageId: number;
    lastMessageId: number;
    user: string;
    char: string;
}

/**
 * TavernHelper-compatible globals for card HTML (status bars, MVU panels): getAllVariables,
 * getVariables, Mvu, eventOn, waitGlobalInitialized, errorCatched… Variables arrive from the parent
 * by postMessage, first on load and again whenever they change (firing VARIABLE_UPDATE_ENDED).
 */
function shim(id: string): string {
    return `<script>(()=>{
const ID=${JSON.stringify(id)};let V={message:{},chat:{},global:{},messageId:0,lastMessageId:0,user:'',char:''};let ready=false,resolve;const readyP=new Promise(r=>resolve=r);
const L={};const clone=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
const emit=(e,...a)=>(L[e]||[]).slice().forEach(f=>{try{f(...a)}catch(err){console.error(err)}});
const events={VARIABLE_INITIALIZED:'mag_variable_initialized',VARIABLE_UPDATE_STARTED:'mag_variable_update_started',SINGLE_VARIABLE_UPDATED:'mag_variable_updated',VARIABLE_UPDATE_ENDED:'mag_variable_update_ended',COMMAND_PARSED:'mag_command_parsed'};
const all=()=>clone(Object.assign({},V.global,V.chat,V.message));
Object.assign(window,{
getAllVariables:all,
getVariables:(o={})=>clone(o.type==='message'?V.message:o.type==='global'?V.global:o.type==='character'||o.type==='script'?{}:V.chat),
getCurrentMessageId:()=>V.messageId,getLastMessageId:()=>V.lastMessageId,getMessageId:()=>V.messageId,
waitGlobalInitialized:async()=>{await readyP;return window.Mvu},
eventOn:(e,f)=>{(L[e]=L[e]||[]).push(f);return{stop:()=>window.eventRemoveListener(e,f)}},
eventOnce:(e,f)=>{const w=(...a)=>{window.eventRemoveListener(e,w);f(...a)};return window.eventOn(e,w)},
eventMakeFirst:(e,f)=>{(L[e]=L[e]||[]).unshift(f)},eventMakeLast:(e,f)=>window.eventOn(e,f),
eventRemoveListener:(e,f)=>{L[e]=(L[e]||[]).filter(x=>x!==f)},eventEmit:async(e,...a)=>emit(e,...a),
errorCatched:f=>(...a)=>{try{const r=f(...a);if(r&&r.catch)r.catch(err=>console.error(err));return r}catch(err){console.error(err)}},
toastr:{info(){},success(){},warning(){},error(){},clear(){}},
triggerSlash:async c=>{parent.postMessage({hearthFrame:ID,slash:String(c)},'*');return ''},substitudeMacros:s=>String(s).replace(/{{user}}/gi,V.user).replace(/{{char}}/gi,V.char),
tavern_events:{MESSAGE_RECEIVED:'message_received',MESSAGE_SENT:'message_sent',MESSAGE_UPDATED:'message_updated',MESSAGE_SWIPED:'message_swiped',CHAT_CHANGED:'chat_id_changed',GENERATION_ENDED:'generation_ended'},
iframe_events:{MESSAGE_IFRAME_RENDER_STARTED:'message_iframe_render_started',MESSAGE_IFRAME_RENDER_ENDED:'message_iframe_render_ended'},
Mvu:{events,getMvuData:(o={})=>clone(V.message),getCurrentMvuData:()=>clone(V.message),replaceMvuData:async()=>{},parseMessage:async()=>{},getMvuVariable:(d,p,o={})=>{let c=d&&d.stat_data!==undefined?d.stat_data:d;for(const s of String(p).replace(/\[(\w+)\]/g,'.$1').split('.').filter(Boolean)){if(c==null)return o.default_value;c=c[s]}return c===undefined?o.default_value:c},setMvuVariable:async()=>false},
SillyTavern:{getContext:()=>({name1:V.user,name2:V.char,chat:[],chatMetadata:{variables:clone(V.chat)}})},
});
addEventListener('message',e=>{const d=e.data;if(!d||!d.hearthVars)return;V=d.hearthVars;window.SillyTavern.name1=V.user;if(!ready){ready=true;resolve();emit(events.VARIABLE_INITIALIZED,all())}else{emit(events.VARIABLE_UPDATE_STARTED,all());emit(events.VARIABLE_UPDATE_ENDED,all())}});
parent.postMessage({hearthFrame:ID,ready:true},'*');
})();</script>`;
}

/** Wraps a card-provided HTML document with the TavernHelper shim, jQuery/lodash and a height reporter. */
export function frameDocument(html: string, id: string, origin: string): string {
    // The frame is sized to its content: the root never scrolls, and html/body take their natural
    // height so viewport-relative sizing (height:100%, 100vh) cannot feed back into the measurement.
    // Only html gets overflow:hidden; touching body would stop its margins from collapsing and shift
    // the card's layout. Inner scroll areas the card designed get slim scrollbars (its own styles win).
    const base = '<style>html{overflow:hidden!important;height:auto!important;min-height:0!important}body{height:auto!important;min-height:0!important}*{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.4) transparent}*::-webkit-scrollbar{width:6px;height:6px}*::-webkit-scrollbar-thumb{background:rgba(128,128,128,.4);border-radius:6px}*::-webkit-scrollbar-track{background:transparent}</style>';
    const head = `<base target="_blank">${base}${shim(id)}<script src="${origin}/vendor/jquery.min.js"></script><script src="${origin}/vendor/lodash.min.js"></script>`;
    // Height = the html element's own box (includes body margins and collapsed child margins), or the
    // bottom of an absolutely positioned top-level element if that reaches further. Fixed overlays
    // such as lightboxes are ignored.
    const reporter = `<script>(()=>{const px=v=>parseFloat(v)||0;const m=()=>{let h=document.documentElement.getBoundingClientRect().height;const b=document.body;if(b)for(const el of b.children){const cs=getComputedStyle(el);if(cs.position!=='absolute'||cs.display==='none')continue;const r=el.getBoundingClientRect();h=Math.max(h,r.bottom+scrollY+px(cs.marginBottom))}return Math.ceil(h)};let last=0;const s=()=>{const h=m();if(h!==last){last=h;parent.postMessage({hearthFrame:${JSON.stringify(id)},h},'*')}};const ro=new ResizeObserver(s);ro.observe(document.documentElement);if(document.body)ro.observe(document.body);new MutationObserver(s).observe(document.documentElement,{subtree:true,childList:true,attributes:true});addEventListener('load',s);[100,400,1200,3000].forEach(t=>setTimeout(s,t));})();</script>`;
    let doc = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, m => m + head) : head + html;
    doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${reporter}</body>`) : doc + reporter;
    return doc;
}
