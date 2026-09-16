/**
 * The phone screens drawn for "Instalar Hoy": inline SVG, no image requests.
 * Each screen is simplified to what matters for its step, and an orange ring
 * pulses on the one thing to tap (the ring stops under reduced motion).
 * Decorative: the slide's words carry the instruction.
 */
import type { ReactNode } from "react";
import type { Art, Phone, ScreenWords } from "./install.ts";

const BRAND = "#3533cd";
const BLUE = "#007aff";
const MUTED = "#6b7090";

const Tap = ({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r?: number }) => (
  <rect className="tap" fill="none" x={x} y={y} width={w} height={h} rx={r ?? Math.min(w, h) / 2} />
);

function Phone({ bg = "#f1f2f9", light = false, children }: { bg?: string; light?: boolean; children: ReactNode }) {
  return (
    <svg viewBox="0 0 180 340" aria-hidden="true">
      <rect width="180" height="340" rx="28" fill="#161a45" />
      <rect x="8" y="8" width="164" height="324" rx="21" fill={bg} />
      <text x="24" y="23" fontSize="8" fontWeight="600" fill={light ? "#fff" : "#1b1f3b"}>9:41</text>
      {children}
    </svg>
  );
}

/** Hoy's sign-in screen, as the client first sees it. */
function Login({ y, w, code, ring }: { y: number; w: ScreenWords; code: string | null; ring?: boolean }) {
  return (
    <g>
      <rect x="8" y={y} width="164" height="78" fill="#3e46c4" />
      <text x="22" y={y + 38} fontSize="22" fontWeight="800" fill="#fff">Hoy</text>
      <text x="22" y={y + 56} fontSize="8" fill="#fff">{w.tagline}</text>
      <circle cx="146" cy={y + 34} r="14" fill="#ffc233" />
      <rect x="18" y={y + 92} width="144" height="102" rx="12" fill="#fff" stroke="#e4e7f0" />
      <text x="30" y={y + 114} fontSize="10" fontWeight="700" fill="#1b1f3b">{w.typeCode}</text>
      <rect x="30" y={y + 124} width="120" height="26" rx="7" fill="#f1f2f9" stroke="#c9cde3" />
      <text x="90" y={y + 141} fontSize={code ? 10 : 9} fontWeight="700" textAnchor="middle" fill={code ? "#1b1f3b" : "#9aa0bd"} letterSpacing="1">
        {code ?? "····-····"}
      </text>
      <rect x="30" y={y + 158} width="120" height="24" rx="12" fill={BRAND} />
      <text x="90" y={y + 174} fontSize="9" fontWeight="700" textAnchor="middle" fill="#fff">{w.enter}</text>
      {ring && <Tap x={26} y={y + 154} w={128} h={32} />}
    </g>
  );
}

/** Chrome's top bar: the address and the ⋮ menu. */
const ChromeBar = ({ url }: { url: string }) => (
  <g>
    <rect x="14" y="30" width="128" height="22" rx="11" fill="#e8eaf2" />
    <text x="24" y="44.5" fontSize="7.5" fill="#3c4060">{short(url)}</text>
    <circle cx="158" cy="35" r="1.9" fill="#3c4060" /><circle cx="158" cy="41" r="1.9" fill="#3c4060" /><circle cx="158" cy="47" r="1.9" fill="#3c4060" />
  </g>
);

const Dim = () => <rect x="8" y="8" width="164" height="324" rx="21" fill="#0b0d2a" opacity=".35" />;

const short = (url: string) => {
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return host.length > 26 ? `${host.slice(0, 25)}…` : host;
};

function HoyIcon({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.24} fill={BRAND} />
      <circle cx={x + s * 0.72} cy={y + s * 0.3} r={s * 0.13} fill="#ffc233" />
      <text x={x + s / 2} y={y + s * 0.7} fontSize={s * 0.32} fontWeight="800" textAnchor="middle" fill="#fff">Hoy</text>
    </g>
  );
}

function Camera({ phone, url }: { phone: Phone; url: string }) {
  const corner = "M50 104v-12h12M130 104v-12h-12M50 186v12h12M130 186v12h-12";
  const pill = phone === "iphone"
    ? { fill: "#ffd60a", ink: "#000", text: `Safari · ${short(url)}` }
    : { fill: "#fff", ink: "#1b1f3b", text: short(url) };
  return (
    <Phone bg="#1a1b22" light>
      <path d={corner} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="60" y="100" width="60" height="60" fill="#fff" transform="translate(0 15)" />
      <g fill="#000" transform="translate(0 15)">
        <path d="M64 104h16v16h-16zM100 104h16v16h-16zM64 140h16v16h-16z" /><path d="M68 108h8v8h-8zM104 108h8v8h-8zM68 144h8v8h-8z" fill="#fff" />
        <path d="M86 106h6v6h-6zM88 124h8v6h-8zM100 128h6v8h-6zM88 144h6v10h-6zM104 146h10v6h-10zM70 126h10v4h-10z" />
      </g>
      <rect x="18" y="222" width="144" height="28" rx="14" fill={pill.fill} />
      <text x="90" y="239.5" fontSize="7.5" fontWeight="600" textAnchor="middle" fill={pill.ink}>{pill.text}</text>
      <Tap x={13} y={217} w={154} h={38} />
      <circle cx="90" cy="298" r="16" fill="none" stroke="#fff" strokeWidth="3" />
    </Phone>
  );
}

function Home() {
  const icons: ReactNode[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 22 + col * 38, y = 44 + row * 52;
      if (row === 1 && col === 1) continue;
      icons.push(<rect key={`${row}-${col}`} x={x} y={y} width="28" height="28" rx="7" fill="#fff" opacity=".3" />);
    }
  }
  return (
    <Phone bg="#5864d8" light>
      <rect x="8" y="170" width="164" height="162" rx="21" fill="#7b5bd6" opacity=".45" />
      {icons}
      <HoyIcon x={60} y={96} s={28} />
      <text x="74" y="136" fontSize="7" fontWeight="600" textAnchor="middle" fill="#fff">Hoy</text>
      <Tap x={53} y={89} w={42} h={52} r={12} />
      <rect x="18" y="278" width="144" height="42" rx="15" fill="#fff" opacity=".25" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={28 + i * 34} y="285" width="26" height="26" rx="7" fill="#fff" opacity=".4" />)}
    </Phone>
  );
}

function Done({ w, name }: { w: ScreenWords; name: string | null }) {
  const first = (name ?? "").split(/\s+/)[0];
  return (
    <Phone bg="#eef0fb">
      <rect x="16" y="32" width="148" height="70" rx="14" fill="#4f5bd5" />
      <text x="28" y="62" fontSize="10.5" fontWeight="800" fill="#fff">{first ? `${w.greeting}, ${first}` : w.greeting}</text>
      <rect x="28" y="74" width="70" height="7" rx="3.5" fill="#fff" opacity=".6" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="16" y={114 + i * 50} width="148" height="42" rx="12" fill="#fff" />
          <rect x="24" y={122 + i * 50} width="26" height="26" rx="8" fill="#eceefd" />
          <rect x="58" y={127 + i * 50} width="60" height="6" rx="3" fill="#d6d9ee" />
          <rect x="58" y={138 + i * 50} width="84" height="6" rx="3" fill="#e8eaf5" />
        </g>
      ))}
      <circle cx="136" cy="286" r="24" fill="#0f7a55" />
      <path d="M124 286l8 8 16-16" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Phone>
  );
}

export function InstallArt({ art, phone, url, w, code, name }: {
  art: Exclude<Art, "qr">; phone: Phone; url: string; w: ScreenWords; code: string | null; name: string | null;
}) {
  switch (art) {
    case "camera":
      return <Camera phone={phone} url={url} />;
    case "chromeMenu":
      return (
        <Phone>
          <ChromeBar url={url} />
          <Login y={60} w={w} code={null} />
          <Tap x={145} y={27} w={26} h={28} />
        </Phone>
      );
    case "chromeAdd": {
      const items = w.menu;
      return (
        <Phone>
          <ChromeBar url={url} />
          <Login y={60} w={w} code={null} />
          <Dim />
          <rect x="20" y="30" width="148" height={20 + items.length * 26} rx="10" fill="#fff" />
          {items.map((label, i) => {
            const on = label === w.addHome;
            return (
              <g key={label}>
                {on && <rect x="24" y={38 + i * 26} width="140" height="22" rx="6" fill="#ecebff" />}
                <text x="32" y={52.5 + i * 26} fontSize="7.5" fontWeight={on ? 700 : 400} fill={on ? BRAND : "#1b1f3b"}>{label}</text>
                {on && <Tap x={19} y={34 + i * 26} w={150} h={30} r={9} />}
              </g>
            );
          })}
        </Phone>
      );
    }
    case "chromeInstall":
      return (
        <Phone>
          <ChromeBar url={url} />
          <Login y={60} w={w} code={null} />
          <Dim />
          <rect x="18" y="112" width="144" height="112" rx="14" fill="#fff" />
          <HoyIcon x={30} y={126} s={30} />
          <text x="70" y="139" fontSize="10" fontWeight="700" fill="#1b1f3b">{w.installTitle}</text>
          <text x="70" y="151" fontSize="6.5" fill={MUTED}>{short(url)}</text>
          <text x="34" y="202" fontSize="8.5" fontWeight="600" fill={BRAND}>{w.cancel}</text>
          <rect x="102" y="188" width="50" height="22" rx="11" fill={BRAND} />
          <text x="127" y="202" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="#fff">{w.install}</text>
          <Tap x={97} y={183} w={60} h={32} />
        </Phone>
      );
    case "safariShare":
      return (
        <Phone>
          <Login y={30} w={w} code={null} />
          <rect x="8" y="268" width="164" height="64" rx="0" fill="#f6f6f8" />
          <rect x="18" y="274" width="144" height="20" rx="10" fill="#fff" stroke="#e1e2e8" />
          <text x="90" y="287" fontSize="7" textAnchor="middle" fill="#3c4060">{short(url)}</text>
          <path d="M30 306l-5 5 5 5M58 306l5 5-5 5" stroke={BLUE} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M84 308h-3v12h18v-12h-3M90 301v13M86 305l4-4 4 4" stroke={BLUE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M116 305c4 0 7 1 8 3 1-2 4-3 8-3v13c-4 0-7 1-8 3-1-2-4-3-8-3z" stroke={BLUE} strokeWidth="1.6" fill="none" />
          <rect x="143" y="304" width="12" height="12" rx="2.5" stroke={BLUE} strokeWidth="1.8" fill="none" />
          <Tap x={75} y={296} w={30} h={30} />
        </Phone>
      );
    case "safariAdd":
      return (
        <Phone>
          <Login y={30} w={w} code={null} />
          <Dim />
          <rect x="8" y="104" width="164" height="228" rx="18" fill="#f2f2f7" />
          <HoyIcon x={20} y={116} s={26} />
          <text x="54" y="127" fontSize="9" fontWeight="700" fill="#1b1f3b">Hoy</text>
          <text x="54" y="138" fontSize="6.5" fill={MUTED}>{short(url)}</text>
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={34 + i * 38} cy="168" r="13" fill="#dfe0e7" />)}
          <rect x="16" y="192" width="148" height={w.share.length * 26} rx="10" fill="#fff" />
          {w.share.map((label, i) => {
            const on = label === w.addToHome;
            return (
              <g key={label}>
                <text x="26" y={209 + i * 26} fontSize="8" fontWeight={on ? 700 : 400} fill="#1b1f3b">{label}</text>
                {on && <path d={`M144 ${198 + i * 26}h12v12h-12zM150 ${201 + i * 26}v6M147 ${204 + i * 26}h6`} stroke="#1b1f3b" strokeWidth="1.4" fill="none" />}
                {on && <Tap x={16} y={192 + i * 26} w={148} h={26} r={8} />}
              </g>
            );
          })}
        </Phone>
      );
    case "safariConfirm":
      return (
        <Phone bg="#f2f2f7">
          <text x="20" y="46" fontSize="8.5" fill={BLUE}>{w.cancel}</text>
          <text x="90" y="66" fontSize="10" fontWeight="700" textAnchor="middle" fill="#1b1f3b">{w.addToHome}</text>
          <text x="160" y="46" fontSize="8.5" fontWeight="700" textAnchor="end" fill={BLUE}>{w.add}</text>
          <Tap x={120} y={32} w={50} h={21} r={8} />
          <rect x="16" y="80" width="148" height="56" rx="10" fill="#fff" />
          <HoyIcon x={24} y={88} s={40} />
          <text x="74" y="106" fontSize="10" fontWeight="600" fill="#1b1f3b">Hoy</text>
          <text x="74" y="122" fontSize="6.5" fill={MUTED}>{short(url)}</text>
          <rect x="16" y="146" width="148" height="28" rx="10" fill="#fff" />
          <text x="26" y="163.5" fontSize="8" fill="#1b1f3b">{w.webApp}</text>
          <rect x="132" y="153" width="24" height="14" rx="7" fill="#34c759" />
          <circle cx="149" cy="160" r="5.5" fill="#fff" />
        </Phone>
      );
    case "home":
      return <Home />;
    case "code":
      return (
        <Phone>
          <Login y={30} w={w} code={code} ring />
        </Phone>
      );
    case "done":
      return <Done w={w} name={name} />;
  }
}
