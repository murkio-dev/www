export type MdSeg = {
    kind: string;
    text: string;
};

export type MdBlock = {
    type: string;
    segs: MdSeg[];
    items: MdSeg[][];
};

const inlineRe = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

function mdInline(text: string): MdSeg[] {
    const out: MdSeg[] = [];
    let last = 0;
    inlineRe.lastIndex = 0;
    let m = inlineRe.exec(text);
    while (m !== null) {
        if (m.index > last) {
            out.push({ kind: "t", text: text.slice(last, m.index) });
        }
        if (m[1] !== undefined) {
            out.push({ kind: "b", text: m[1] });
        } else if (m[2] !== undefined) {
            out.push({ kind: "i", text: m[2] });
        } else {
            out.push({ kind: "c", text: m[3] });
        }
        last = m.index + m[0].length;
        m = inlineRe.exec(text);
    }
    if (last < text.length) {
        out.push({ kind: "t", text: text.slice(last) });
    }
    return out;
}

export function mdBlocks(source: string): MdBlock[] {
    const blocks: MdBlock[] = [];
    if (!source) {
        return blocks;
    }

    let para: string[] = [];
    let list: MdSeg[][] = [];

    const flushPara = () => {
        if (para.length > 0) {
            blocks.push({ type: "p", segs: mdInline(para.join(" ")), items: [] });
            para = [];
        }
    };
    const flushList = () => {
        if (list.length > 0) {
            blocks.push({ type: "ul", segs: [], items: list });
            list = [];
        }
    };

    for (const raw of source.split("\n")) {
        const line = raw.trim();
        if (line === "") {
            flushPara();
            flushList();
        } else if (/^#{1,3}\s+/.test(line)) {
            flushPara();
            flushList();
            blocks.push({ type: "h", segs: mdInline(line.replace(/^#{1,3}\s+/, "")), items: [] });
        } else if (/^[-*]\s+/.test(line)) {
            flushPara();
            list.push(mdInline(line.replace(/^[-*]\s+/, "")));
        } else {
            flushList();
            para.push(line);
        }
    }
    flushPara();
    flushList();
    return blocks;
}
