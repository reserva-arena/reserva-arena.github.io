import { useState, useEffect, useMemo, useRef, createContext, useContext } from "react";
import { db, auth } from "./firebase";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "firebase/auth";
import {
  collection, addDoc, onSnapshot, doc, updateDoc,
  query, where, getDocs, Timestamp, setDoc, getDoc, deleteDoc,
} from "firebase/firestore";

const secondaryApp  = getApps().find((a) => a.name === "secondary")
  || initializeApp(auth.app.options, "secondary");
const secondaryAuth = getAuth(secondaryApp);
import ARENA_LOGO from "./assets/arena-logo.png";

const ThemeCtx = createContext({ dark: false, toggle: () => {} });
const useTheme = () => useContext(ThemeCtx);

const HORARIOS = ["07:10","08:00","09:10","10:00","11:10","12:00","12:50","13:40","14:30","15:20","16:10","17:00"];
const ESPACOS = [
  { id:1,  nome:"Biblioteca",                      tipo:"espaco"      },
  { id:2,  nome:"Maker A. Iniciais",              tipo:"espaco"      },
  { id:3,  nome:"Maker A. Finais",                tipo:"espaco"      },
  { id:4,  nome:"Ateliê de Artes",                  tipo:"espaco"      },
  { id:5,  nome:"Sala de Dança",                    tipo:"espaco"      },
  { id:6,  nome:"Sala Multifuncional",              tipo:"espaco"      },
  { id:7,  nome:"Cozinha Experimental",             tipo:"espaco"      },
  { id:8,  nome:"Lab. de Ciências Anos Iniciais",   tipo:"laboratorio" },
  { id:9,  nome:"Lab. de Ciências Anos Finais",     tipo:"laboratorio" },
  { id:10, nome:"Tablets (18 disp.)",         tipo:"equipamento", estoque:18 },
  { id:11, nome:"Computadores (16 disp.)",    tipo:"equipamento", estoque:16 },
];
const TURMAS = (() => {
  const t = [];
  for (let ano=1;ano<=5;ano++) ["A","B","C","D","E"].forEach((l)=>t.push(`${ano}º${l}`));
  for (let ano=6;ano<=9;ano++) ["A","B","C","D","E","F","G","H"].forEach((l)=>t.push(`${ano}º${l}`));
  return t;
})();
const today = new Date();

// Dias NÃO letivos do Colégio Arena 2026
const DIAS_NAO_LETIVOS = new Set([
  // Janeiro
  "2026-01-01", // Ano Novo
  // Fevereiro
  "2026-02-16", // Recesso Carnaval
  "2026-02-17", // Carnaval
  "2026-02-18", // Recesso Carnaval
  // Abril
  "2026-04-02", // Quinta-feira Santa
  "2026-04-03", // Sexta-feira Santa
  "2026-04-20", // Recesso
  "2026-04-21", // Tiradentes
  // Maio
  "2026-05-01", // Dia do Trabalho
  // Junho
  "2026-06-04", // Corpus Christi
  "2026-06-05", // Recesso (emenda Corpus Christi)
  // "2026-06-19" - Recesso apenas para Anos Iniciais/Infantil (Fundamental 2 tem aula normal)
  "2026-06-20", // Festa Junina (sábado - já bloqueado por ser fim de semana)
  "2026-06-30", // Fim do 1º semestre
  // Julho (férias inteiras)
  ...Array.from({length:31},(_,i)=>`2026-07-${String(i+1).padStart(2,"0")}`),
  // Agosto
  "2026-08-07", // Independência do Brasil (dia útil - sexta-feira)
  // Outubro
  "2026-10-12", // Padroeira do Brasil / Dia das Crianças
  "2026-10-13", // Recesso Dia do Professor
  "2026-10-24", // Aniversário de Goiânia
  // Novembro
  "2026-11-02", // Finados
  "2026-11-15", // Proclamação da República
  "2026-11-20", // Zumbi e Consciência Negra
  "2026-11-27", // Recesso organização Festival
  "2026-11-28", // Festival Arena
  // Dezembro
  "2026-12-25", // Natal
]);

const isDiaLetivo=(data)=>{
  if (!data) return false;
  const [a,m,d]=data.split("-").map(Number);
  const dt=new Date(a,m-1,d);
  const dow=dt.getDay();
  // Fim de semana nunca é dia letivo
  if(dow===0||dow===6) return false;
  // Verificar se está na lista de não letivos
  if(DIAS_NAO_LETIVOS.has(data)) return false;
  // Fora do período letivo (antes de 19/01 ou depois de 10/12)
  if(data<"2026-01-19"||data>"2026-12-10") return false;
  return true;
};

// Dias não letivos apenas para Anos Iniciais (1º ao 5º ano)
const DIAS_NAO_LETIVOS_INICIAIS = new Set([
  "2026-06-19", // Recesso organização Festa Junina (só Anos Iniciais 1º–5º)
]);

// Verifica se o dia é letivo considerando a turma (alguns dias bloqueiam só Anos Iniciais)
const isDiaLetivoParaTurma=(data, turma)=>{
  if(!isDiaLetivo(data)) return false;
  const anoTurma=parseInt(turma);
  if(anoTurma>=1&&anoTurma<=5&&DIAS_NAO_LETIVOS_INICIAIS.has(data)) return false;
  return true;
};

// Conta dias letivos úteis entre agora e a data/hora do agendamento
const diasLetivosAte=(dataStr)=>{
  const agora=new Date();
  const [a,m,d]=dataStr.split("-").map(Number);
  const alvo=new Date(a,m-1,d,7,10,0);
  let count=0;
  const cur=new Date(agora);
  cur.setHours(0,0,0,0);
  const fim=new Date(alvo);
  fim.setHours(0,0,0,0);
  while(cur<fim){
    const ds=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}-${String(cur.getDate()).padStart(2,"0")}`;
    if(isDiaLetivo(ds)) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
};
const fmt = (d) => { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; };
const ADMIN_EMAIL = "luciano.galdino@colegioarena.com.br";

const LIGHT = {
  navy:"#132318", navyMid:"#1a6b47", blue:"#1a6b47", blueMid:"#40b07a",
  bg:"#f8faf8", surface:"#ffffff", border:"#c7dfd4", borderLight:"#e2f0eb",
  text:"#132318", textMid:"#3d5c45", textMuted:"#607060",
  green:"#0f4c2b", greenBg:"#e2f4ea", greenBorder:"#6ee7a0",
  amber:"#7c2d12", amberBg:"#fff7ed", amberBorder:"#fed7aa",
  red:"#7f1d1d", redBg:"#fef2f2", redBorder:"#fca5a5",
  logoBg:"#ffffff", headerBg:"#ffffff", headerBorder:"1px solid #c7dfd4",
  cardShadow:"0 1px 6px rgba(26,107,71,.09)", inputBg:"#ffffff", inputBorder:"#c7dfd4",
};
const DARK = {
  navy:"#d1fae5", navyMid:"#a7f3d0", blue:"#34d399", blueMid:"#10b981",
  bg:"#0a1a12", surface:"#0f2318", border:"#1a3d27", borderLight:"#142d1e",
  text:"#ecfdf5", textMid:"#a7f3d0", textMuted:"#6b9e80",
  green:"#6ee7b7", greenBg:"#052e16", greenBorder:"#065f46",
  amber:"#fbbf24", amberBg:"#1c1408", amberBorder:"#7c2d12",
  red:"#f87171", redBg:"#1a0505", redBorder:"#7f1d1d",
  logoBg:"#0f2318", headerBg:"#0f2318", headerBorder:"1px solid #1a3d27",
  cardShadow:"0 1px 6px rgba(0,0,0,.35)", inputBg:"#0a1a12", inputBorder:"#1a3d27",
};

function GlobalStyle({ dark }) {
  const C = dark ? DARK : LIGHT;
  return <style dangerouslySetInnerHTML={{ __html: `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    html { min-height:100%; background:${C.bg}; }
    body { font-family:'DM Sans',system-ui,sans-serif; background:${C.bg}; color:${C.text}; transition:background .3s,color .3s; min-height:100vh; padding-bottom:env(safe-area-inset-bottom,0px); }
    #root { min-height:100vh; background:${C.bg}; }
    input,select,textarea,button { font-family:inherit; }
    ::-webkit-scrollbar { width:5px; height:5px; }
    ::-webkit-scrollbar-track { background:${C.bg}; }
    ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
    .slot-btn { transition:all .2s cubic-bezier(.34,1.56,.64,1); }
    .slot-btn:not(:disabled):hover { transform:translateY(-3px) scale(1.04); box-shadow:0 8px 20px rgba(26,107,71,.25); }
    .slot-btn:not(:disabled):active { transform:translateY(0) scale(.98); }
    .card-hover { transition:all .25s ease; }
    .card-hover:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(19,35,24,.10) !important; }
    .btn-hover { transition:all .2s cubic-bezier(.34,1.56,.64,1); }
    .btn-hover:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 16px rgba(26,107,71,.3); }
    .btn-hover:active:not(:disabled) { transform:translateY(0); }
    .kpi-hover { transition:all .25s ease; cursor:default; }
    .kpi-hover:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,.1); }
    .logo-hover { transition:all .3s cubic-bezier(.34,1.56,.64,1); }
    .logo-hover:hover { transform:scale(1.1) rotate(-3deg); box-shadow:0 8px 24px rgba(19,35,24,.15); }
    .row-hover { transition:all .15s ease; }
    .row-hover:hover { transform:translateX(3px); border-left-width:5px !important; }
    .fade-in { animation:fadeIn .3s ease forwards; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    [data-replit-badge], #replit-badge { display:none !important; }
    iframe[src*="replit"] { display:none !important; }
    .semana-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
    .banner-prof { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 14px; background:#1a6b47; }
    .banner-prof-nav { display:flex; align-items:center; gap:6px; }
    .prof-card { padding:14px 16px; }
    @media (max-width:600px) {
      .semana-grid { display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; }
      .semana-grid::-webkit-scrollbar { height:3px; }
      .semana-grid::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
      .semana-dia { min-width:140px !important; max-width:140px !important; scroll-snap-align:start; flex-shrink:0; }
      .banner-prof { gap:6px; padding:8px 10px; }
      .banner-prof-nav p { font-size:11px !important; min-width:58px !important; }
      .prof-card { padding:10px 10px; }
      .prof-toggle-row { flex-wrap:nowrap !important; overflow-x:auto; gap:5px !important; }
    }
    @media (max-width:400px) {
      .semana-dia { min-width:120px !important; max-width:120px !important; }
    }
  `}} />;
}

function useC() { const { dark } = useTheme(); return dark ? DARK : LIGHT; }

function Logo({ size=34 }) {
  const C = useC();
  return (
    <div className="logo-hover" style={{ width:size, height:size, borderRadius:size*0.25, background:C.logoBg, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,.15)", cursor:"pointer" }}>
      {ARENA_LOGO ? <img src={ARENA_LOGO} alt="Arena" style={{ width:size*0.85, height:size*0.85, objectFit:"contain" }} /> : <span style={{fontSize:size*0.5}}>🏫</span>}
    </div>
  );
}

function Avatar({ nome, size=36, variant="blue" }) {
  const C = useC();
  const v = { blue:{bg:"#e2f0eb",c:C.blueMid}, navy:{bg:"#c7d7f5",c:C.navy}, purple:{bg:"#ede9fe",c:"#6d28d9"} }[variant] || {bg:"#e2f0eb",c:C.blueMid};
  const initials = nome ? nome.split(" ").map((n)=>n[0]).filter(Boolean).slice(0,2).join("").toUpperCase() : "?";
  return <div style={{ width:size, height:size, borderRadius:"50%", background:v.bg, color:v.c, fontWeight:800, fontSize:size*0.36, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{initials}</div>;
}

function Badge({ status }) {
  const cfg = { confirmado:{bg:"#e2f4ea",c:"#0f4c2b",label:"Confirmado"}, pendente:{bg:"#fff7ed",c:"#7c2d12",label:"Pendente"}, recusado:{bg:"#fef2f2",c:"#7f1d1d",label:"Recusado"} };
  const s = cfg[status]||cfg.pendente;
  return <span style={{ background:s.bg, color:s.c, fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap" }}>{s.label}</span>;
}

function Btn({ children, onClick, disabled, variant="primary", size="md", style={}, className="" }) {
  const C = useC();
  const V = { primary:{bg:C.blueMid,c:"#fff",b:C.blueMid}, navy:{bg:C.navy,c:"#fff",b:C.navy}, danger:{bg:"#dc2626",c:"#fff",b:"#dc2626"}, success:{bg:"#1a6b47",c:"#fff",b:"#1a6b47"}, ghost:{bg:"transparent",c:C.textMid,b:C.border}, amber:{bg:"#d97706",c:"#fff",b:"#d97706"} }[variant]||{bg:C.blueMid,c:"#fff",b:C.blueMid};
  const S = {sm:{p:"5px 12px",f:12},md:{p:"9px 18px",f:13.5},lg:{p:"12px 24px",f:14.5}}[size];
  return <button onClick={onClick} disabled={disabled} className={"btn-hover "+className} style={{ background:disabled?"#cbd5e1":V.bg, color:disabled?"#94a3b8":V.c, border:`1.5px solid ${disabled?"#cbd5e1":V.b}`, borderRadius:8, fontWeight:700, cursor:disabled?"not-allowed":"pointer", padding:S.p, fontSize:S.f, transition:"all .2s", ...style }}>{children}</button>;
}

function Card({ children, style={} }) {
  const C = useC();
  return <div className="card-hover" style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:C.cardShadow, padding:20, transition:"background .3s,border .3s,transform .25s,box-shadow .25s", ...style }}>{children}</div>;
}

function Field({ label, required, hint, children }) {
  const C = useC();
  return (
    <div style={{ display:"grid", gap:5 }}>
      <label style={{ fontSize:12, fontWeight:700, color:C.textMuted, letterSpacing:".3px", textTransform:"uppercase" }}>{label}{required&&<span style={{ color:"#ef4444", marginLeft:2 }}>*</span>}</label>
      {children}
      {hint&&<p style={{ fontSize:11, color:C.textMuted }}>{hint}</p>}
    </div>
  );
}

function Alert({ type="error", children }) {
  const C = useC();
  const cfg = { error:{bg:C.redBg,b:C.redBorder,c:C.red}, success:{bg:C.greenBg,b:C.greenBorder,c:C.green}, warning:{bg:C.amberBg,b:C.amberBorder,c:C.amber} }[type];
  return <div style={{ background:cfg.bg, border:`1px solid ${cfg.b}`, borderRadius:8, padding:"10px 14px", fontSize:13, color:cfg.c, lineHeight:1.5 }}>{children}</div>;
}

function useInp() {
  const C = useC();
  return { width:"100%", padding:"10px 12px", borderRadius:8, fontSize:13.5, border:`1.5px solid ${C.inputBorder}`, background:C.inputBg, color:C.text, outline:"none", transition:"border-color .15s,background .3s", boxSizing:"border-box" };
}

function DarkToggle() {
  const { dark, toggle } = useTheme();
  return <button onClick={toggle} className="btn-hover" style={{ position:"fixed", bottom:28, right:28, zIndex:999, width:52, height:52, borderRadius:"50%", background:dark?"#f1f5f9":"#0f172a", color:dark?"#0f172a":"#f1f5f9", border:"none", cursor:"pointer", fontSize:24, boxShadow:"0 6px 20px rgba(0,0,0,.3)", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .3s cubic-bezier(.34,1.56,.64,1)" }} title={dark?"Modo claro":"Modo escuro"}>{dark?"☀️":"🌙"}</button>;
}
// ─── CORREÇÃO PRINCIPAL: HorariosOcupados ────────────────────────────────────
// excluirId="" como default evita undefined; r?.status com optional chaining
function HorariosOcupados({ espaco, data, horarioSelecionado, onSelect, excluirId="", excluirHorarios=[] }) {
  const C = useC();
  const [ocupados,setOcupados] = useState([]);
  const [loading,setLoading]   = useState(false);

  useEffect(() => {
    if (!espaco||!data) { setOcupados([]); return; }
    setLoading(true);
    getDocs(query(collection(db,"reservas"),where("espaco","==",espaco),where("data","==",data))).then((snap)=>{
      setOcupados(
        snap.docs
          .map((d)=>({id:d.id,...d.data()}))
          .filter((r)=>r?.status!=="recusado" && r.id!==excluirId)
      );
      setLoading(false);
    });
  },[espaco,data,excluirId]);

  if (!espaco||!data) return null;
  return (
    <div style={{ marginTop:6 }}>
      <p style={{ fontSize:11.5, color:C.textMuted, marginBottom:10, fontWeight:600 }}>{loading?"Verificando...":"Selecione um horário disponível"}</p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7 }}>
        {HORARIOS.map((h)=>{
          const r=ocupados.find((o)=>o.horario===h);
          const ocp=!!r||excluirHorarios.includes(h);
          const sel=h===horarioSelecionado;
          return (
            <button key={h} className="slot-btn" title={ocp?`Reservado: ${r?.professor} — ${r?.turma}`:"Disponível"} onClick={()=>!ocp&&onSelect(h)} disabled={ocp}
              style={{ padding:"9px 4px", borderRadius:8, border:sel?"2px solid "+C.blueMid:ocp?"1.5px solid "+C.redBorder:"1.5px solid "+C.greenBorder, background:sel?C.greenBg.replace("dcf","dbea").replace("e7","fe"):ocp?C.redBg:C.greenBg, color:sel?C.blueMid:ocp?C.red:C.green, fontSize:12.5, fontWeight:700, cursor:ocp?"not-allowed":"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>{h}</span>
              <span style={{ fontSize:9, fontWeight:600, opacity:.8 }}>{ocp?"● Ocupado":sel?"✓ Selecionado":"○ Livre"}</span>
            </button>
          );
        })}
      </div>
      {ocupados.length>0&&(
        <div style={{ marginTop:10, padding:"10px 12px", background:C.bg, borderRadius:8, border:`1px solid ${C.border}` }}>
          <p style={{ fontSize:11, color:C.textMuted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Ocupados nesta data</p>
          {ocupados.map((r,i)=>(
            <p key={i} style={{ fontSize:12, color:C.textMid, marginTop:3 }}>
              <span style={{ color:C.red, fontWeight:700, fontFamily:"'DM Mono',monospace" }}>{r.horario}</span> — {r.professor} <span style={{ color:C.textMuted }}>({r.turma})</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const fmtDia = (str) => {
  const [a,m,d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m-1, d));
  const dias  = ["Dom.","Seg.","Ter.","Qua.","Qui.","Sexta","Sáb."];
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const dow = dt.getUTCDay();
  return { diaSemana:dias[dow], dia:String(d).padStart(2,"0"), mes:meses[m-1], isWeekend:dow===0||dow===6 };
};
const addDays = (dateStr, n) => {
  const [a,m,d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m-1, d+n));
  return dt.toISOString().split("T")[0];
};
const getSegunda = (dateStr) => {
  const [a,m,d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m-1, d));
  const dow = dt.getUTCDay();
  const diff = dow===0 ? -6 : 1-dow;
  return addDays(dateStr, diff);
};
const statusColorCal = (s) => ({ confirmado:{ bg:"#e2f4ea", border:"#6ee7a0", text:"#0f4c2b" }, pendente:{ bg:"#fff7ed", border:"#fed7aa", text:"#7c2d12" }, recusado:{ bg:"#fef2f2", border:"#fca5a5", text:"#7f1d1d" } }[s]||{ bg:"#e8f0ec", border:"#c7dfd4", text:"#3d5c45" });
const tipoIcon = (tipo) => ({ espaco:"🏛️", laboratorio:"🔬", equipamento:"💻" }[tipo]||"📍");
const extraInfo = (r) => {
  if (!r) return "";
  const eo = ESPACOS.find(e=>e.nome===r.espaco);
  if (eo?.tipo==="equipamento" && r.quantidade) return `${r.quantidade} un.`;
  if (eo?.tipo==="laboratorio") return r.laboratorista==="Sim" ? "c/ lab." : r.laboratorista==="Não" ? "s/ lab." : "";
  return "";
};

function TooltipCal({ reserva, C }) {
  if (!reserva) return null;
  const sc = statusColorCal(reserva.status);
  return (
    <div style={{ position:"absolute", zIndex:200, top:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)", minWidth:220, maxWidth:280, background:C.surface, border:`1.5px solid ${sc.border}`, borderRadius:10, padding:"10px 13px", boxShadow:"0 8px 24px rgba(0,0,0,.18)", pointerEvents:"none" }}>
      <div style={{ fontSize:11, fontWeight:800, color:sc.text, marginBottom:5, textTransform:"uppercase" }}>{reserva.status}</div>
      <p style={{ fontSize:13, fontWeight:700, color:C.navy, marginBottom:3 }}>{reserva.professor}</p>
      <p style={{ fontSize:12, color:C.textMid, marginBottom:2 }}>{reserva.turma}</p>
      <p style={{ fontSize:11.5, color:C.textMuted, fontStyle:"italic", lineHeight:1.4 }}>{reserva.conteudo}</p>
      {reserva.espaco&&<p style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>📍 {reserva.espaco}</p>}
      {reserva.laboratorista==="Sim"&&<p style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>🔬 Com laboratorista</p>}
      {reserva.quantidade&&<p style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>🖥️ {reserva.quantidade} unidades</p>}
    </div>
  );
}

function CelulaCal({ reserva, isPast, C, onClick }) {
  const [hover, setHover] = useState(false);
  const sc = reserva ? statusColorCal(reserva.status) : null;
  if (isPast && !reserva) return (
    <td style={{ padding:0, height:80, background:C.bg, opacity:.4, borderBottom:`1px solid ${C.borderLight}` }}>
      <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:9, color:C.textMuted }}>—</span></div>
    </td>
  );
  return (
    <td style={{ padding:2, height:80, position:"relative", borderBottom:`1px solid ${C.borderLight}` }} onMouseEnter={()=>reserva&&setHover(true)} onMouseLeave={()=>setHover(false)}>
      {reserva ? (
        <div style={{ height:"100%", borderRadius:6, padding:"4px 7px", background:sc.bg, border:`1px solid ${sc.border}`, cursor:"pointer", overflow:"hidden", transition:"transform .15s,box-shadow .15s", transform:hover?"scale(1.03)":"scale(1)", boxShadow:hover?`0 4px 12px ${sc.border}88`:"none", display:"flex", flexDirection:"column", justifyContent:"center", gap:1 }}>
          <p style={{ fontSize:10.5, fontWeight:800, color:sc.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.2 }}>{reserva.professor?.split(" ")[0]}</p>
          <p style={{ fontSize:9.5, fontWeight:700, color:sc.text, opacity:.85, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.2 }}>{reserva.espaco}</p>
          <p style={{ fontSize:9, color:sc.text, opacity:.65, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.2 }}>{reserva.turma}</p>
        </div>
      ) : (
        <div onClick={onClick} style={{ height:"100%", borderRadius:6, border:`1.5px dashed ${hover?C.blueMid:C.borderLight}`, background:hover?"rgba(26,107,71,.05)":"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
          {hover&&<span style={{ fontSize:11, color:C.blueMid, fontWeight:700 }}>+ Reservar</span>}
        </div>
      )}
      {hover&&reserva&&<TooltipCal reserva={reserva} C={C} />}
    </td>
  );
}

function GradePorEspacoCal({ reservas, data, C, onCelulaClick, hoje }) {
  const idx = useMemo(()=>{ const m={}; reservas.forEach(r=>{ if(r.data!==data) return; if(!m[r.espaco])m[r.espaco]={}; m[r.espaco][r.horario]=r; }); return m; },[reservas,data]);
  const agora = new Date();
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", minWidth:"100%", tableLayout:"fixed" }}>
        <colgroup><col style={{ width:72 }} />{ESPACOS.map(e=><col key={e.id} style={{ width:120 }} />)}</colgroup>
        <thead>
          <tr>
            <th style={{ padding:"8px 10px", background:C.surface, borderBottom:`2px solid ${C.border}`, position:"sticky", left:0, zIndex:10 }}></th>
            {ESPACOS.map(e=>(
              <th key={e.id} style={{ padding:"8px 6px", fontSize:10.5, fontWeight:700, color:C.textMid, background:C.surface, borderBottom:`2px solid ${C.border}`, textAlign:"center", lineHeight:1.3, borderLeft:`1px solid ${C.borderLight}` }}>
                <span style={{ fontSize:13 }}>{tipoIcon(e.tipo)}</span>
                <div style={{ marginTop:2, whiteSpace:"normal", wordBreak:"break-word" }}>{e.nome}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HORARIOS.map(h=>{
            const [hh,mm]=h.split(":").map(Number);
            const slotDt=new Date(data+"T00:00:00"); slotDt.setHours(hh,mm);
            const isPast = data===hoje ? slotDt<agora : data<hoje;
            return (
              <tr key={h} style={{ background:isPast?C.bg:C.surface }}>
                <td style={{ padding:"0 10px", fontSize:11.5, fontWeight:800, color:isPast?C.textMuted:C.blueMid, fontFamily:"'DM Mono',monospace", textAlign:"right", whiteSpace:"nowrap", background:C.surface, position:"sticky", left:0, zIndex:5, borderBottom:`1px solid ${C.borderLight}`, borderRight:`2px solid ${C.border}` }}>{h}</td>
                {ESPACOS.map(e=><CelulaCal key={e.id} reserva={idx[e.nome]?.[h]} isPast={isPast} C={C} onClick={()=>onCelulaClick(e.nome,data,h)} />)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GradePorDiaCal({ reservas, semanaInicio, filtroEspaco, C, onCelulaClick, hoje }) {
  const diasSemana = Array.from({length:5},(_,i)=>addDays(semanaInicio,i));
  const idx = useMemo(()=>{
    const m={};
    reservas.forEach(r=>{ if(filtroEspaco&&r.espaco!==filtroEspaco) return; if(!m[r.data])m[r.data]={}; if(!m[r.data][r.horario]||r.status==="confirmado") m[r.data][r.horario]=r; });
    return m;
  },[reservas,filtroEspaco]);
  const agora = new Date();
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", width:"100%", tableLayout:"fixed" }}>
        <colgroup><col style={{ width:64 }} />{diasSemana.map(d=><col key={d} style={{ width:`${100/5}%` }} />)}</colgroup>
        <thead>
          <tr>
            <th style={{ padding:"8px 10px", background:C.surface, borderBottom:`2px solid ${C.border}`, position:"sticky", left:0, zIndex:10 }}></th>
            {diasSemana.map(d=>{
              const { diaSemana, dia, mes } = fmtDia(d); const isHoje = d===hoje;
              return (
                <th key={d} style={{ padding:"8px 4px", textAlign:"center", background:isHoje?"rgba(26,107,71,.07)":C.surface, borderBottom:`2px solid ${isHoje?C.blueMid:C.border}`, borderLeft:`1px solid ${C.borderLight}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:isHoje?C.blueMid:C.textMuted, textTransform:"uppercase" }}>{diaSemana}</div>
                  <div style={{ fontSize:17, fontWeight:900, color:isHoje?C.blueMid:C.navy, lineHeight:1.1, marginTop:1 }}>{dia}</div>
                  <div style={{ fontSize:9.5, color:C.textMuted }}>{mes}</div>
                  {isHoje&&<div style={{ width:6, height:6, borderRadius:"50%", background:C.blueMid, margin:"3px auto 0" }} />}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HORARIOS.map(h=>(
            <tr key={h}>
              <td style={{ padding:"0 8px", fontSize:11, fontWeight:800, color:C.blueMid, fontFamily:"'DM Mono',monospace", textAlign:"right", background:C.surface, position:"sticky", left:0, zIndex:5, borderBottom:`1px solid ${C.borderLight}`, borderRight:`2px solid ${C.border}`, whiteSpace:"nowrap" }}>{h}</td>
              {diasSemana.map(d=>{ const [hh,mm]=h.split(":").map(Number); const slotDt=new Date(d+"T00:00:00"); slotDt.setHours(hh,mm); const isPast = d===hoje ? slotDt<agora : d<hoje; return <CelulaCal key={d} reserva={idx[d]?.[h]} isPast={isPast} C={C} onClick={()=>onCelulaClick(filtroEspaco||"",d,h)} />; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ─── Calendário Mensal para o Admin (dentro de CalendarioSemanal modo=mês) ───
function CalMensalAdmin({ reservas, filtroEspaco, hoje, C, onNovaReserva }) {
  const agora2 = new Date();
  const [mesCal,setMesCal] = useState({a:agora2.getFullYear(),m:agora2.getMonth()});
  const [diaSel,setDiaSel] = useState(null);
  const nomeMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mesCal.m];
  const primeiroDia = new Date(Date.UTC(mesCal.a,mesCal.m,1));
  const diasNoMes   = new Date(Date.UTC(mesCal.a,mesCal.m+1,0)).getUTCDate();
  const inicioGrid  = primeiroDia.getUTCDay();
  const navMes=(dir)=>{ setMesCal(({a,m})=>{ let nm=m+dir,na=a; if(nm>11){nm=0;na++;} if(nm<0){nm=11;na--;} return {a:na,m:nm}; }); setDiaSel(null); };
  const cells=[]; for(let i=0;i<inicioGrid;i++)cells.push(null); for(let d=1;d<=diasNoMes;d++)cells.push(d);

  const porData = useMemo(()=>{
    const m={};
    reservas.filter(r=>r.status!=="recusado"&&(!filtroEspaco||r.espaco===filtroEspaco)).forEach(r=>{ if(!m[r.data])m[r.data]=[]; m[r.data].push(r); });
    return m;
  },[reservas,filtroEspaco]);

  const isUrgente2 = r=>{ try { const agora=new Date(); const [h,mm]=r.horario.split(":").map(Number); const ev=new Date(r.data+"T00:00:00"); ev.setHours(h,mm); return (ev-agora)/3600000<24&&ev>agora&&r.status==="pendente"; } catch { return false; } };

  return (
    <div>
      {/* Header navegação mês */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
        <button onClick={()=>navMes(-1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <p style={{ fontSize:16, fontWeight:800, color:C.navy }}>{nomeMes} {mesCal.a}</p>
          <p style={{ fontSize:11, color:C.textMuted }}>{Object.values(porData).flat().filter(r=>r.data.startsWith(`${mesCal.a}-${String(mesCal.m+1).padStart(2,"0")}`)).length} agendamentos</p>
        </div>
        <button onClick={()=>navMes(1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
      </div>
      {/* Cabeçalho dias */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:C.bg, borderBottom:`1px solid ${C.border}` }}>
        {["Dom.","Seg.","Ter.","Qua.","Qui.","Sexta","Sáb."].map((d,i)=>(
          <div key={d} style={{ padding:"8px 0", textAlign:"center", fontSize:10.5, fontWeight:700, color:i===0||i===6?"#ef4444":C.textMuted, textTransform:"uppercase", letterSpacing:".3px" }}>{d}</div>
        ))}
      </div>
      {/* Grid dias */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
        {cells.map((d,i)=>{
          if (!d) return <div key={i} style={{ minHeight:80, borderRight:`1px solid ${C.borderLight}`, borderBottom:`1px solid ${C.borderLight}`, background:C.bg }} />;
          const dateStr=`${mesCal.a}-${String(mesCal.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const isPast=dateStr<hoje, isHoje=dateStr===hoje, isSel=dateStr===diaSel;
          const rsdia=porData[dateStr]||[];
          const urgDia=rsdia.filter(isUrgente2);
          const pendDia=rsdia.filter(r=>r.status==="pendente"&&!isUrgente2(r));
          const confDia=rsdia.filter(r=>r.status==="confirmado");
          const dow=new Date(Date.UTC(mesCal.a,mesCal.m,d)).getUTCDay();
          const naoLetivoCal=!isDiaLetivo(dateStr)&&!isPast&&dow!==0&&dow!==6;
          return (
            <div key={i} onClick={()=>setDiaSel(isSel?null:dateStr)} style={{ minHeight:80, borderRight:`1px solid ${C.borderLight}`, borderBottom:`1px solid ${C.borderLight}`, padding:"5px 6px", cursor:"pointer", background:isSel?"rgba(26,107,71,.08)":isHoje?"rgba(26,107,71,.04)":naoLetivoCal?"rgba(239,68,68,.04)":isPast?"rgba(0,0,0,.015)":"transparent", transition:"background .15s" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:13, fontWeight:isHoje?900:500, color:isSel?"#40b07a":isHoje?"#40b07a":isPast?C.textMuted:naoLetivoCal?"#ef4444":dow===0||dow===6?"#ef4444":C.navy, width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isHoje?"rgba(26,107,71,.15)":naoLetivoCal?"rgba(239,68,68,.12)":"transparent" }}>{d}</span>
                {rsdia.length>0&&<span style={{ fontSize:9.5, fontWeight:700, color:urgDia.length>0?"#c2410c":pendDia.length>0?C.amber:C.green, background:urgDia.length>0?"#fff7ed":pendDia.length>0?C.amberBg:C.greenBg, borderRadius:6, padding:"1px 4px" }}>{rsdia.length}</span>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {urgDia.slice(0,1).map(r=><div key={r.id} style={{ background:"#fff7ed", border:"1px solid #f97316", borderRadius:3, padding:"1px 4px", fontSize:9, fontWeight:700, color:"#c2410c", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>⚡ {r.horario} {r.espaco.split(" ")[0]}</div>)}
                {pendDia.slice(0,1).map(r=><div key={r.id} style={{ background:C.amberBg, border:`1px solid ${C.amberBorder}`, borderRadius:3, padding:"1px 4px", fontSize:9, fontWeight:600, color:C.amber, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>⏳ {r.horario} {r.espaco.split(" ")[0]}</div>)}
                {confDia.slice(0,2).map(r=><div key={r.id} style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:3, padding:"1px 4px", fontSize:9, fontWeight:600, color:C.green, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.horario} {r.espaco.split(" ")[0]}</div>)}
                {rsdia.length>3&&<div style={{ fontSize:8.5, color:C.textMuted }}>+{rsdia.length-3}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {/* Detalhe do dia selecionado */}
      {diaSel&&(
        <div style={{ borderTop:`2px solid ${C.border}`, padding:"14px 16px", background:C.bg }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <p style={{ fontSize:14, fontWeight:800, color:C.navy }}>📅 {diaSel.split("-").reverse().join("/")} · {(porData[diaSel]||[]).length} agendamento{(porData[diaSel]||[]).length!==1?"s":""}</p>
            <button onClick={()=>setDiaSel(null)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:7, color:C.textMuted, fontSize:12, padding:"4px 10px", cursor:"pointer" }}>✕</button>
          </div>
          {(porData[diaSel]||[]).length===0
            ? <p style={{ fontSize:13, color:C.textMuted }}>🎉 Nenhum agendamento.</p>
            : [...(porData[diaSel]||[])].sort((a,b)=>a.horario>b.horario?1:-1).map(r=>{
                const urg=isUrgente2(r); const bc=r.status==="confirmado"?"#1a6b47":r.status==="pendente"?"#d97706":"#dc2626";
                return (
                  <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:9, marginBottom:6, background:urg?"#fff7ed":C.surface, border:`1px solid ${urg?"#f97316":C.border}`, borderLeft:`4px solid ${urg?"#f97316":bc}` }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, color:urg?"#c2410c":C.blueMid, fontSize:13, minWidth:42 }}>{r.horario}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:C.navy }}>{r.espaco}</span>
                        <span style={{ fontSize:11, color:C.textMuted }}>·</span>
                        <span style={{ fontSize:12.5, fontWeight:600, color:C.textMid }}>{r.professor}</span>
                        <span style={{ fontSize:11, color:C.textMuted }}>·</span>
                        <span style={{ fontSize:12, color:C.textMuted }}>{r.turma}</span>
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <Badge status={r.status} />
                        {urg&&<span style={{ fontSize:10.5, fontWeight:800, background:"#fff7ed", color:"#c2410c", border:"1.5px solid #f97316", padding:"1px 7px", borderRadius:9 }}>⚡ URGENTE</span>}
                        {r.conteudo&&<span style={{ fontSize:11, color:C.textMuted }}>{r.conteudo}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      {r.status==="pendente"&&<Btn onClick={()=>updateDoc(doc(db,"reservas",r.id),{status:"confirmado"})} variant="success" size="sm">✓</Btn>}
                      {r.status==="pendente"&&<Btn onClick={()=>updateDoc(doc(db,"reservas",r.id),{status:"recusado"})} variant="danger" size="sm">✗</Btn>}
                    </div>
                  </div>
                );
              })
          }
          {diaSel>=hoje&&onNovaReserva&&(
            <button onClick={()=>onNovaReserva("",diaSel,"")} style={{ marginTop:8, padding:"8px 16px", borderRadius:8, border:`1.5px dashed ${C.border}`, background:"transparent", color:C.blueMid, fontWeight:700, fontSize:13, cursor:"pointer", width:"100%" }}>+ Agendar neste dia</button>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarioSemanal({ onNovaReserva }) {
  const C = useC();
  const hoje = fmt(today);
  const [modo,setModo] = useState("dia");        // "dia" = grade por dia  | "espaco" = grade por espaço
  const [modoPeriodo,setModoPeriodo] = useState("semana"); // "semana" | "mes"
  const [semanaInicio,setSemana] = useState(()=>getSegunda(hoje));
  const [dataEspaco,setDataEspaco] = useState(hoje);
  const [filtroEspaco,setFiltroEspaco] = useState("");
  const [reservas,setReservas] = useState([]);
  const [loading,setLoading] = useState(true);

  useEffect(()=>onSnapshot(collection(db,"reservas"),snap=>{
    setReservas(snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r&&r.professor&&r.data&&r.horario));
    setLoading(false);
  }),[]);

  const diasSemana = Array.from({length:5},(_,i)=>addDays(semanaInicio,i));
  const stats = useMemo(()=>{
    const sr=reservas.filter(r=>diasSemana.includes(r.data));
    const ativas=sr.filter(r=>r.status!=="recusado");
    return { total:ativas.length, confirmadas:sr.filter(r=>r.status==="confirmado").length, pendentes:sr.filter(r=>r.status==="pendente").length, ocupacao:Math.round(ativas.length/(ESPACOS.length*HORARIOS.length*5)*100) };
  },[reservas,semanaInicio]);

  const navSemana=(dir)=>setSemana(s=>addDays(s,dir*7));
  const fmt3=(s)=>{ const {dia,mes}=fmtDia(s); return `${dia} ${mes}`; };
  const semanaFim=addDays(semanaInicio,4);
  const inpStyle={ padding:"7px 11px", borderRadius:7, border:`1.5px solid ${C.inputBorder}`, background:C.inputBg, color:C.text, fontSize:12.5, fontFamily:"inherit", cursor:"pointer", outline:"none" };

  if (loading) return <div style={{ textAlign:"center", padding:"48px", color:C.textMuted }}><div style={{ fontSize:32, marginBottom:8, animation:"pulse 1.5s infinite" }}>📅</div><p style={{ fontSize:13, fontWeight:600 }}>Carregando calendário...</p></div>;

  return (
    <div className="fade-in">
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:14 }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:800, color:C.navy, marginBottom:2 }}>📅 Calendário de Reservas</h2>
            <p style={{ fontSize:12.5, color:C.textMuted }}>Visualize e gerencie todos os agendamentos</p>
          </div>
          <div style={{ display:"flex", gap:2, background:C.bg, borderRadius:8, padding:3, border:`1px solid ${C.border}` }}>
            {[{id:"dia",label:"📆 Por Dia"},{id:"espaco",label:"🏛️ Por Espaço"}].map(m=>(
              <button key={m.id} onClick={()=>setModo(m.id)} style={{ padding:"6px 14px", borderRadius:6, border:"none", fontSize:12, fontWeight:700, cursor:"pointer", background:modo===m.id?C.navy:"transparent", color:modo===m.id?"#fff":C.textMuted, transition:"all .15s" }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          {[{label:"Esta semana",val:stats.total,bg:"#e2f0eb",c:C.blueMid},{label:"Confirmadas",val:stats.confirmadas,bg:"#e2f4ea",c:"#0f4c2b"},{label:"Pendentes",val:stats.pendentes,bg:"#fff7ed",c:"#7c2d12"},{label:"Ocupação",val:stats.ocupacao+"%",bg:"#f3e8ff",c:"#6d28d9"}].map(k=>(
            <div key={k.label} style={{ background:k.bg, borderRadius:8, padding:"7px 14px", display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:18, fontWeight:900, color:k.c }}>{k.val}</span>
              <span style={{ fontSize:11, fontWeight:700, color:k.c, opacity:.75 }}>{k.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          {/* Toggle Semana / Mês — só aparece no modo grade por dia */}
          <div style={{ display:"flex", background:C.bg, borderRadius:8, padding:2, border:`1px solid ${C.border}` }}>
            {[{id:"semana",label:"Semana"},{id:"mes",label:"Mês"}].map(op=>(
              <button key={op.id} onClick={()=>setModoPeriodo(op.id)} style={{ padding:"5px 14px", borderRadius:6, border:"none", background:modoPeriodo===op.id?C.navy:"transparent", color:modoPeriodo===op.id?"#fff":C.textMuted, fontWeight:700, fontSize:12.5, cursor:"pointer", transition:"all .15s" }}>{op.label}</button>
            ))}
          </div>

          {modo==="dia" && modoPeriodo==="semana" && (
            <>
              <button onClick={()=>navSemana(-1)} style={{ ...inpStyle, padding:"7px 12px", fontWeight:800, fontSize:15 }}>‹</button>
              <div style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"6px 14px", fontSize:13, fontWeight:700, color:C.navy, whiteSpace:"nowrap" }}>{fmt3(semanaInicio)} – {fmt3(semanaFim)}</div>
              <button onClick={()=>navSemana(1)} style={{ ...inpStyle, padding:"7px 12px", fontWeight:800, fontSize:15 }}>›</button>
              <button onClick={()=>setSemana(getSegunda(hoje))} style={{ ...inpStyle, fontSize:12, fontWeight:700, color:C.blueMid, borderColor:C.blueMid }}>Hoje</button>
              <select value={filtroEspaco} onChange={e=>setFiltroEspaco(e.target.value)} style={{ ...inpStyle, minWidth:180 }}>
                <option value="">Todos os espaços</option>
                <optgroup label="Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                <optgroup label="Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                <optgroup label="Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
              </select>
            </>
          )}
          {modo==="dia" && modoPeriodo==="mes" && (
            <>
              <button onClick={()=>setDataEspaco(hoje)} style={{ ...inpStyle, fontSize:12, fontWeight:700, color:C.blueMid, borderColor:C.blueMid }}>Hoje</button>
            </>
          )}
        </div>
      </div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:C.cardShadow }}>
        {modo==="espaco"
          ? <GradePorEspacoCal reservas={reservas} data={dataEspaco} C={C} hoje={hoje} onCelulaClick={(espaco,data,horario)=>onNovaReserva&&onNovaReserva(espaco,data,horario)} />
          : modoPeriodo==="semana"
            ? <GradePorDiaCal reservas={reservas} semanaInicio={semanaInicio} filtroEspaco={filtroEspaco} C={C} hoje={hoje} onCelulaClick={(espaco,data,horario)=>onNovaReserva&&onNovaReserva(espaco,data,horario)} />
            : <CalMensalAdmin reservas={reservas} filtroEspaco={filtroEspaco} hoje={hoje} C={C} onNovaReserva={onNovaReserva} />
        }
      </div>
      <div style={{ display:"flex", gap:16, marginTop:12, flexWrap:"wrap", alignItems:"center" }}>
        {[{label:"Confirmado",bg:"#e2f4ea",border:"#6ee7a0"},{label:"Pendente",bg:"#fff7ed",border:"#fed7aa"},{label:"Disponível",bg:"transparent",border:C.borderLight,dashed:true},{label:"Passado",bg:C.bg,border:C.borderLight}].map(l=>(
          <div key={l.label} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:16, height:16, borderRadius:4, background:l.bg, border:`1.5px ${l.dashed?"dashed":"solid"} ${l.border}` }} />
            <span style={{ fontSize:11.5, color:C.textMuted, fontWeight:600 }}>{l.label}</span>
          </div>
        ))}
        <span style={{ marginLeft:"auto", fontSize:11, color:C.textMuted }}>💡 Hover para detalhes · Clique em vazio para reservar</span>
      </div>
    </div>
  );
}
function ModalEdicao({ reserva, onClose, onSave, isAdmin }) {
  const C = useC(); const inp = useInp(); const sel = { ...inp, cursor:"pointer" };
  const [form,setForm] = useState({ espaco:reserva.espaco, data:reserva.data, horario:reserva.horario, turma:reserva.turma, conteudo:reserva.conteudo||"", paginas:reserva.paginas||"", laboratorista:reserva.laboratorista||"", quantidade:reserva.quantidade||1 });
  const [salvando,setSalvando] = useState(false);
  const [erro,setErro] = useState("");
  const espacoObj = ESPACOS.find((e)=>e.nome===form.espaco);
  const isLab = espacoObj?.tipo==="laboratorio"; const isEquip = espacoObj?.tipo==="equipamento";
  const set = (k,v) => setForm((f)=>({...f,[k]:v}));
  const isUrgente = () => { try { const [h,m]=form.horario.split(":").map(Number); const ev=new Date(form.data+"T00:00:00"); ev.setHours(h,m); return (ev-new Date())/3600000<24&&ev>new Date(); } catch { return false; } };
  const handleSave = async () => {
    if (!form.espaco||!form.data||!form.horario||!form.turma||!form.conteudo) return setErro("Preencha todos os campos obrigatórios.");
    setSalvando(true); setErro("");
    try {
      const novoStatus = isAdmin ? reserva.status : isUrgente() ? "pendente" : "confirmado";
      await updateDoc(doc(db,"reservas",reserva.id),{ espaco:form.espaco, data:form.data, horario:form.horario, turma:form.turma, conteudo:form.conteudo, paginas:form.paginas, laboratorista:form.laboratorista, quantidade:isEquip?Number(form.quantidade):null, status:novoStatus, editadoEm:Timestamp.now() });
      onSave();
    } catch { setErro("Erro ao salvar. Tente novamente."); }
    finally { setSalvando(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
      <div className="fade-in" style={{ background:C.surface, borderRadius:16, padding:28, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ fontSize:17, fontWeight:800, color:C.navy }}>✏️ Editar Agendamento</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.textMuted }}>✕</button>
        </div>
        {erro && <div style={{ marginBottom:14 }}><Alert type="error">{erro}</Alert></div>}
        <div style={{ display:"grid", gap:16 }}>
          <Field label="Espaço / Equipamento" required>
            <select value={form.espaco} onChange={(e)=>{set("espaco",e.target.value);set("horario","");}} style={sel}>
              <option value="">Selecione...</option>
              <optgroup label="Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
              <optgroup label="Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
              <optgroup label="Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            </select>
          </Field>
          {isEquip&&<Field label={`Quantidade (máx ${espacoObj.estoque})`} required><input type="number" min={1} max={espacoObj.estoque} value={form.quantidade} onChange={(e)=>set("quantidade",e.target.value)} style={{ ...inp, width:140 }} /></Field>}
          {isLab&&<Field label="Laboratorista?" required><div style={{ display:"flex", gap:20, marginTop:4 }}>{["Sim","Não"].map(op=><label key={op} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", fontSize:13.5 }}><input type="radio" name="labEdit" value={op} checked={form.laboratorista===op} onChange={()=>set("laboratorista",op)} />{op}</label>)}</div></Field>}
          <Field label="Data" required><input type="date" value={form.data} min={fmt(today)} onChange={(e)=>{set("data",e.target.value);set("horario","");}} style={inp} /></Field>
          {form.espaco&&form.data&&<Field label="Horário" required><HorariosOcupados espaco={form.espaco} data={form.data} horarioSelecionado={form.horario} onSelect={(h)=>set("horario",h)} excluirId={reserva.id} /></Field>}
          <Field label="Turma" required>
            <select value={form.turma} onChange={(e)=>set("turma",e.target.value)} style={sel}>
              <option value="">Selecione...</option>
              <optgroup label="Anos Iniciais">{TURMAS.filter(t=>parseInt(t)<=5).map(t=><option key={t}>{t}</option>)}</optgroup>
              <optgroup label="Anos Finais">{TURMAS.filter(t=>parseInt(t)>=6).map(t=><option key={t}>{t}</option>)}</optgroup>
            </select>
          </Field>
          <Field label="Conteúdo da Aula" required><textarea value={form.conteudo} onChange={(e)=>set("conteudo",e.target.value)} rows={3} style={{ ...inp, resize:"vertical", lineHeight:1.6 }} /></Field>
          <Field label="Páginas do Livro" hint="Opcional"><input value={form.paginas} onChange={(e)=>set("paginas",e.target.value)} placeholder="Ex: pp. 45–62" style={inp} /></Field>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:4 }}>
            <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
            <Btn onClick={handleSave} disabled={salvando||!form.horario} variant="primary">{salvando?"Salvando...":"Salvar alterações ✓"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarioMensal({ reservasPorData, onSelectDia, dataSelecionada }) {
  const C = useC();
  const hoje = fmt(today);
  const [mes, setMes] = useState(() => { const d=new Date(); return {a:d.getFullYear(),m:d.getMonth()}; });
  const nomeMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mes.m];
  const primeiroDia = new Date(Date.UTC(mes.a, mes.m, 1));
  const diasNoMes = new Date(Date.UTC(mes.a, mes.m+1, 0)).getUTCDate();
  const inicioGrid = primeiroDia.getUTCDay();
  const navMes=(dir)=>setMes(({a,m})=>{ let nm=m+dir,na=a; if(nm>11){nm=0;na++;} if(nm<0){nm=11;na--;} return {a:na,m:nm}; });
  const cells=[]; for(let i=0;i<inicioGrid;i++)cells.push(null); for(let d=1;d<=diasNoMes;d++)cells.push(d);
  return (
    <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, boxShadow:C.cardShadow, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:`1px solid ${C.border}` }}>
        <button onClick={()=>navMes(-1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.textMid, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}><p style={{ fontSize:17, fontWeight:800, color:C.navy }}>{nomeMes}</p><p style={{ fontSize:12, color:C.textMuted }}>{mes.a}</p></div>
        <button onClick={()=>navMes(1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.textMid, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
      </div>
      <div style={{ padding:"12px 16px 16px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>
          {["Dom.","Seg.","Ter.","Qua.","Qui.","Sexta","Sáb."].map(d=><div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:d==="DOM"||d==="SÁB"?"#ef4444":C.textMuted, padding:"4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {cells.map((d,i)=>{
            if (!d) return <div key={i} />;
            const dateStr = `${mes.a}-${String(mes.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const isHoje=dateStr===hoje, isPast=dateStr<hoje, isSel=dateStr===dataSelecionada;
            const temReserva=reservasPorData?.[dateStr]?.length>0;
            const dow=new Date(Date.UTC(mes.a,mes.m,d)).getUTCDay(), isFimSemana=dow===0||dow===6;
            return (
              <button key={i} onClick={()=>!isPast&&isDiaLetivo(dateStr)&&onSelectDia(dateStr)} disabled={isPast||!isDiaLetivo(dateStr)} title={!isDiaLetivo(dateStr)&&!isPast?"Dia não letivo":""} style={{ aspectRatio:"1", borderRadius:8, border:"none", cursor:(isPast||!isDiaLetivo(dateStr))?"not-allowed":"pointer", background:isSel?"#40b07a":isHoje?"rgba(26,107,71,.12)":!isDiaLetivo(dateStr)&&!isPast?"rgba(239,68,68,.08)":"transparent", color:isSel?"#fff":isPast?"#cbd5e1":!isDiaLetivo(dateStr)?"#fca5a5":isFimSemana?"#ef4444":C.navy, fontWeight:isHoje||isSel?800:500, fontSize:13.5, position:"relative", transition:"all .15s", opacity:isPast?.4:1 }}>
                {d}
                {temReserva&&!isSel&&<div style={{ position:"absolute", bottom:3, left:"50%", transform:"translateX(-50%)", width:4, height:4, borderRadius:"50%", background:"#40b07a" }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CORREÇÃO 2: BlocoAgendamento — excluirId="" + b?.horario ─────────────────
function BlocoAgendamento({ idx, espaco, data, bloco, onChange, onRemove, ocupadosGlobal, C, inp, sel }) {
  const espacoObj = ESPACOS.find(e=>e.nome===espaco);
  const isLab = espacoObj?.tipo==="laboratorio"; const isEquip = espacoObj?.tipo==="equipamento";
  const set=(k,v)=>onChange(idx,k,v);
  return (
    <div style={{ background:C.bg, border:`1.5px solid ${bloco.horario?C.blueMid+"55":C.border}`, borderRadius:12, padding:"16px 16px 12px", position:"relative", transition:"border-color .2s" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:24, height:24, borderRadius:"50%", background:bloco.horario?"#40b07a":"#cbd5e1", color:"#fff", fontWeight:800, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>{idx+1}</div>
          <span style={{ fontSize:13, fontWeight:700, color:C.navy }}>{bloco.horario ? `Turma ${idx+1} · ${bloco.horario}` : `Turma ${idx+1} — selecione o horário`}</span>
          {bloco.horario&&bloco.turma&&<span style={{ fontSize:11, color:C.textMuted }}>· {bloco.turma}</span>}
        </div>
        {idx>0&&<button onClick={()=>onRemove(idx)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:18, lineHeight:1, padding:"2px 4px" }}>✕</button>}
      </div>
      <div style={{ display:"grid", gap:13 }}>
        <Field label="Horário" required>
          {/* CORREÇÃO: excluirId="" explícito + b?.horario com optional chaining */}
          <HorariosOcupados
            espaco={espaco}
            data={data}
            horarioSelecionado={bloco.horario}
            onSelect={(h)=>set("horario",h)}
            excluirId=""
            excluirHorarios={ocupadosGlobal.filter((_,i)=>i!==idx).map(b=>b?.horario).filter(Boolean)}
          />
        </Field>
        {isEquip&&<Field label={`Quantidade (máx ${espacoObj.estoque})`} required><input type="number" min={1} max={espacoObj.estoque} value={bloco.quantidade} onChange={e=>set("quantidade",e.target.value)} style={{...inp,width:140}} /></Field>}
        {isLab&&<Field label="Necessita do laboratorista?" required><div style={{ display:"flex", gap:20, marginTop:4 }}>{["Sim","Não"].map(op=><label key={op} style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", fontSize:13.5 }}><input type="radio" name={`lab_${idx}`} value={op} checked={bloco.laboratorista===op} onChange={()=>set("laboratorista",op)} />{op}</label>)}</div></Field>}
        <Field label="Turma" required>
          <select value={bloco.turma} onChange={e=>set("turma",e.target.value)} style={sel}>
            <option value="">Selecione a turma...</option>
            <optgroup label="Anos Iniciais">{TURMAS.filter(t=>parseInt(t)<=5).map(t=><option key={t}>{t}</option>)}</optgroup>
            <optgroup label="Anos Finais">{TURMAS.filter(t=>parseInt(t)>=6).map(t=><option key={t}>{t}</option>)}</optgroup>
          </select>
        </Field>
        <Field label="Conteúdo da Aula" required><textarea value={bloco.conteudo} onChange={e=>set("conteudo",e.target.value)} placeholder="Descreva o conteúdo..." rows={2} style={{...inp,resize:"vertical",lineHeight:1.6}} /></Field>
        <Field label="Páginas do Livro" hint="Opcional"><input value={bloco.paginas} onChange={e=>set("paginas",e.target.value)} placeholder="Ex: pp. 45–62" style={inp} /></Field>
      </div>
    </div>
  );
}

function ModalResumo({ espaco, data, blocos, onConfirmar, onCancelar, salvando, C }) {
  const [ano,mes,dia]=data.split("-"); const dataFmt=`${dia}/${mes}/${ano}`;
  const [ciente, setCiente] = useState(false);

  // Detecta urgência (< 24h) por bloco
  const agora = new Date();
  const dow = new Date(Date.UTC(+ano,+mes-1,+dia)).getUTCDay();
  const isFimSemana = dow===0||dow===6;

  const blocosUrgentes = blocos.filter(b=>{
    try {
      const [h,m]=b.horario.split(":").map(Number);
      const ev=new Date(+ano, +mes-1, +dia, h, m, 0, 0);
      const diff=(ev-agora)/3600000;
      // Condição 1: menos de 24h
      if(diff<24&&diff>0) return true;
      // Condição 2: agendado durante período sem T.E.
      const dowAgora=agora.getDay(); const horaAgora=agora.getHours()+agora.getMinutes()/60;
      const semTE=(dowAgora===5&&horaAgora>=17)||(dowAgora===6)||(dowAgora===0&&horaAgora<7);
      const dowAlvo=new Date(+ano,+mes-1,+dia).getDay();
      if(semTE&&diff>0&&diasLetivosAte(`${ano}-${String(mes).padStart(2,"0")}-${String(dia).padStart(2,"0")}`)<1) return true;
      return false;
    } catch { return false; }
  });

  const precisaCiencia = blocosUrgentes.length>0||isFimSemana;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
      <div className="fade-in" style={{ background:C.surface, borderRadius:16, padding:28, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,.3)" }}>

        {/* Cabeçalho */}
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ width:52, height:52, borderRadius:"50%", background:precisaCiencia?"#fff7ed":"#e2f4ea", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, margin:"0 auto 12px" }}>{precisaCiencia?"⚠️":"📋"}</div>
          <h3 style={{ fontSize:17, fontWeight:800, color:C.navy }}>Revisar agendamento</h3>
          <p style={{ fontSize:13, color:C.textMuted, marginTop:4 }}>Confira os dados antes de confirmar</p>
        </div>

        {/* Alerta de urgência / fim de semana */}
        {precisaCiencia&&(
          <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:10, padding:"10px 14px", marginBottom:12 }}>
            <p style={{ fontSize:12.5, fontWeight:800, color:"#7c2d12", marginBottom:5 }}>
              {isFimSemana ? "⚠️ Agendamento feito fora do horário do T.E." : "⚠️ Menos de 24h de antecedência"}
            </p>
            {isFimSemana&&(
              <p style={{ fontSize:12, color:"#92400e", lineHeight:1.5, marginBottom:6 }}>
                Este agendamento foi feito <strong>após 17h de sexta ou durante o fim de semana</strong>, quando o T.E. não está disponível para organizar o espaço ou equipamento. O agendamento ficará <strong>pendente</strong> até aprovação.
              </p>
            )}
            {blocosUrgentes.length>0&&(
              <p style={{ fontSize:12, color:"#92400e", lineHeight:1.5, marginBottom:6 }}>
                {isFimSemana?"Além disso, c":"C"}ontate a administração do colégio para confirmar.
              </p>
            )}
            <p style={{ fontSize:11.5, color:"#92400e", fontStyle:"italic" }}>
              Sem aprovação, o espaço não estará garantido.
            </p>
          </div>
        )}

        {/* Local e data */}
        <div style={{ background:C.bg, borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:6 }}>Local e data</p>
          <p style={{ fontSize:14, fontWeight:700, color:C.navy }}>📍 {espaco}</p>
          <p style={{ fontSize:13, color:C.textMid, marginTop:2 }}>📅 {dataFmt}{isFimSemana?" · "+["Dom","","","","","","Sáb"][dow]:""}</p>
        </div>

        {/* Lista de blocos */}
        <div style={{ display:"grid", gap:8, marginBottom:precisaCiencia?16:20 }}>
          {blocos.map((b,i)=>{
            const isUrg=blocosUrgentes.includes(b);
            return (
              <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"10px 14px", background:C.surface, border:`1px solid ${isUrg?"#fed7aa":C.border}`, borderRadius:8, borderLeft:`3px solid ${isUrg?"#f97316":"#40b07a"}` }}>
                <div style={{ minWidth:42 }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, color:isUrg?"#c2410c":"#40b07a", fontSize:13 }}>{b.horario}</span>
                  {isUrg&&<p style={{ fontSize:9, fontWeight:700, color:"#c2410c", marginTop:1 }}>urgente</p>}
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:C.navy }}>{b.turma}</p>
                  <p style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{b.conteudo}</p>
                  {b.paginas&&<p style={{ fontSize:11, color:C.textMuted }}>📖 {b.paginas}</p>}
                  {b.laboratorista==="Sim"&&<p style={{ fontSize:11, color:C.textMuted }}>🔬 Com laboratorista</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Checkbox de ciência */}
        {precisaCiencia&&(
          <label style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:18, cursor:"pointer", padding:"12px 14px", background:ciente?"#e2f4ea":"#f8faf8", border:`1.5px solid ${ciente?"#6ee7a0":"#c7dfd4"}`, borderRadius:10, transition:"all .2s" }}>
            <input type="checkbox" checked={ciente} onChange={e=>setCiente(e.target.checked)} style={{ width:18, height:18, marginTop:1, accentColor:"#1a6b47", flexShrink:0, cursor:"pointer" }} />
            <span style={{ fontSize:12, color:C.navy, lineHeight:1.5, fontWeight:ciente?700:400 }}>
              {blocosUrgentes.length>0&&isFimSemana
                ? "Estou ciente de que este agendamento é em fim de semana e com menos de 24h de antecedência, ficando pendente até aprovação. Entrarei em contato com o T.E. para garantir a disponibilidade do espaço ou equipamento."
                : isFimSemana
                  ? "Estou ciente: agendamento em fim de semana fica pendente até aprovação do administrador."
                  : "Estou ciente de que este agendamento tem menos de 24h de antecedência. Entrarei em contato com o T.E. (Tecnologia Educacional) para garantir que o espaço ou equipamento estará organizado e disponível."
              }
            </span>
          </label>
        )}

        {/* Botões */}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancelar} style={{ flex:1, padding:"11px", borderRadius:8, border:`1.5px solid ${C.border}`, background:"transparent", color:C.textMid, fontWeight:700, cursor:"pointer", fontSize:13 }}>← Revisar</button>
          <button onClick={onConfirmar} disabled={salvando||(precisaCiencia&&!ciente)} style={{ flex:2, padding:"11px", borderRadius:8, border:"none", background:(precisaCiencia&&!ciente)?"#c7dfd4":"#1a6b47", color:"#fff", fontWeight:800, cursor:(precisaCiencia&&!ciente)?"not-allowed":"pointer", fontSize:13.5, transition:"background .2s" }}>
            {salvando?"Salvando...":`✓ Confirmar ${blocos.length} agendamento${blocos.length>1?"s":""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── CORREÇÃO 3: ProfessorView — remove desestruturação inválida no modo mês,
//                guarda r?.professor em todos os filtros de todasReservas ──────
function ProfessorView({ usuario }) {
  const C = useC(); const inp = useInp();
  const [espacoSel, setEspacoSel] = useState("");
  const [dataSel, setDataSel]     = useState("");
  const [minhas, setMinhas]       = useState([]);
  const [editando, setEditando]   = useState(null);
  const [mostrarResumo, setMostrarResumo] = useState(false);
  const [filtroGrade, setFiltroGrade]     = useState("meus");
  const [filtroEspacoGrade, setFiltroEspacoGrade] = useState("");
  const [modoVisu, setModoVisu]   = useState("semana");
  const [modoCard, setModoCard]   = useState("calendario");
  const [semanaInicio, setSemanaInicio] = useState(()=>getSegunda(fmt(today)));
  const [diaMesSel, setDiaMesSel] = useState(null);
  const [mesProfCal, setMesProfCal] = useState(()=>{ const d=new Date(); return {a:d.getFullYear(),m:d.getMonth()}; });
  const [alertaUrgente, setAlertaUrgente] = useState(null); // data string | null
  const [salvando, setSalvando]   = useState(false);
  const [sucesso, setSucesso]     = useState(null); // null | {status:"confirmado"|"pendente", motivo:"urgente"|"fimSemana"|null}
  const [erro, setErro]           = useState("");

  const keyRef = useRef(0);
  const blocoVazio = () => ({ _key:++keyRef.current, horario:"", turma:"", conteudo:"", paginas:"", laboratorista:"", quantidade:1 });
  const [blocos, setBlocos] = useState(()=>[blocoVazio()]);

  useEffect(()=>{
    if (!usuario?.uid) return;
    return onSnapshot(query(collection(db,"reservas"),where("professorId","==",usuario.uid)),(snap)=>
      setMinhas(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.data>b.data?1:-1))
    );
  },[usuario?.uid]);

  const [todasReservas, setTodasReservas] = useState([]);
  useEffect(()=>onSnapshot(collection(db,"reservas"),snap=>
    // guarda: só processa docs com professor definido
    setTodasReservas(snap.docs.map(d=>d.data()).filter(r=>r&&r.professor&&r.data&&r.horario))
  ),[]);

  const reservasPorData = useMemo(()=>{
    const m={};
    todasReservas.filter(r=>r?.espaco===espacoSel&&r?.status!=="recusado").forEach(r=>{ if(!m[r.data])m[r.data]=[]; m[r.data].push(r); });
    return m;
  },[todasReservas,espacoSel]);

  const pendentes = minhas.filter(r=>r.status==="pendente");
  const cancelar=async(id)=>{ if (!window.confirm("Cancelar esta reserva?")) return; await deleteDoc(doc(db,"reservas",id)); };
  const onChange=(i,k,v)=>setBlocos(bs=>bs.map((b,idx)=>idx===i?{...b,[k]:v}:b));
  const onRemove=(i)=>setBlocos(bs=>bs.filter((_,idx)=>idx!==i));
  const addBloco=()=>setBlocos(bs=>[...bs,blocoVazio()]);

  const blocoValido=(b)=>{
    if (!b) return false;
    const eo=ESPACOS.find(e=>e.nome===espacoSel);
    if (!b.horario||!b.turma||!b.conteudo) return false;
    if (eo?.tipo==="laboratorio"&&!b.laboratorista) return false;
    return true;
  };
  const todosValidos = blocos.every(blocoValido);

  const isUrgente=(data,horario)=>{ 
    try { 
      const agora=new Date();
      const [ano2,mes2,dia2]=data.split("-").map(Number); 
      const [h,m]=horario.split(":").map(Number); 
      const ev=new Date(ano2,mes2-1,dia2,h,m,0,0); 
      const diff=(ev-agora)/3600000;
      if(diff<=0) return false;
      // Condição 1: menos de 24h
      if(diff<24) return true;
      // Condição 2: agendado durante período sem T.E.
      const dowAgora=agora.getDay(); const horaAgora=agora.getHours()+agora.getMinutes()/60;
      const semTE=(dowAgora===5&&horaAgora>=17)||(dowAgora===6)||(dowAgora===0&&horaAgora<7);
      if(semTE&&diasLetivosAte(data)<1) return true;
      // Condição 3: menos de 1 dia letivo até o agendamento
      if(isDiaLetivo(data)&&diasLetivosAte(data)<1) return true;
      return false;
    } catch { return false; } 
  };
  const isDiaUrgente=(data)=>{ try { const [a2,m2,d2]=data.split("-").map(Number); const ev=new Date(a2,m2-1,d2,23,59,59); const diff=(ev-new Date())/3600000; return diff>=0&&diff<24; } catch { return false; } };
  const agendarDia=(data)=>{ 
    const turmaSel=blocos[0]?.turma||""; if(!isDiaLetivoParaTurma(data,turmaSel)){ alert("⚠️ Este dia é não letivo para a turma selecionada (feriado, recesso ou férias) e não pode ser agendado."); return; }
    setDataSel(data); setBlocos([blocoVazio()]); setTimeout(()=>document.getElementById("seletor-espaco")?.scrollIntoView({behavior:"smooth",block:"center"}),120); 
  };

  const handleSalvar=async()=>{
    setSalvando(true); setErro("");
    try {
      for (const b of blocos) {
        const conflito=await getDocs(query(collection(db,"reservas"),where("espaco","==",espacoSel),where("data","==",dataSel),where("horario","==",b.horario)));
        const existe=conflito.docs.map(d=>d.data()).find(r=>r?.status!=="recusado");
        if (existe) { setErro(`Horário ${b.horario} já foi reservado por ${existe.professor}.`); setSalvando(false); setMostrarResumo(false); return; }
      }
      const eo=ESPACOS.find(e=>e.nome===espacoSel);
      for (const b of blocos) {
        const urgente=isUrgente(dataSel,b.horario);
        await addDoc(collection(db,"reservas"),{ professor:usuario.nome, professorId:usuario.uid, professorEmail:usuario.email, turma:b.turma, espaco:espacoSel, data:dataSel, horario:b.horario, conteudo:b.conteudo, paginas:b.paginas||"", laboratorista:b.laboratorista||"", quantidade:eo?.tipo==="equipamento"?Number(b.quantidade):null, status:urgente?"pendente":"confirmado", criadoEm:Timestamp.now() });
      }
      const algumUrgente=blocos.some(b=>isUrgente(dataSel,b.horario));
      const dowFinal=new Date(Date.UTC(...dataSel.split("-").map(Number).map((v,i)=>i===1?v-1:v))).getUTCDay();
      const ehFimSemana=dowFinal===0||dowFinal===6;
      const motivoPendente=algumUrgente&&ehFimSemana?"ambos":algumUrgente?"urgente":ehFimSemana?"fimSemana":null;
      setSucesso({status:motivoPendente?"pendente":"confirmado", motivo:motivoPendente}); setMostrarResumo(false);
    } catch { setErro("Erro ao salvar. Tente novamente."); setSalvando(false); setMostrarResumo(false); }
    finally { setSalvando(false); }
  };

  const resetForm=()=>{ setEspacoSel(""); setDataSel(""); setBlocos([blocoVazio()]); setSucesso(null); setErro(""); };
  const hoje = fmt(new Date());
  const nomeProf=(nome)=>{ if(!nome) return ""; const p=nome.trim().split(" ").filter(Boolean); if(p.length===1) return p[0]; const ult=p[p.length-1]; return p[0]+" "+ult[0].toUpperCase()+"."; };
  const fmtTurma=(t)=>{ if(!t) return ""; return t.replace(/º Ano /g,"º").replace(/ª Ano /g,"ª"); };
  const eDiaUrgente=(data)=>{ 
    try { 
      const agora=new Date();
      const [a,m,d]=data.split("-").map(Number); 
      const primeirHorario=new Date(a,m-1,d,7,10,0); 
      const diff=(primeirHorario-agora)/3600000;
      if(diff<=0) return false; // já passou
      // Condição 1: menos de 24h até o primeiro horário do dia
      if(diff<24) return true;
      // Condição 2: agendado durante fim de semana sem T.E., mas APENAS para o próximo dia letivo
      // (após 17h sexta até 07h segunda — só alerta para o dia imediatamente seguinte)
      const dowAgora=agora.getDay();
      const horaAgora=agora.getHours()+agora.getMinutes()/60;
      const semTE=(dowAgora===5&&horaAgora>=17)||(dowAgora===6)||(dowAgora===0&&horaAgora<7);
      if(semTE&&diasLetivosAte(data)<1) return true;
      // Condição 3: menos de 1 dia letivo entre agora e o agendamento
      if(isDiaLetivoParaTurma(data,blocos.map(b=>b.turma).find(t=>t)||"")&&diasLetivosAte(data)<1) return true;
      return false;
    } catch { return false; } 
  };

  const semanaReservas = useMemo(()=>{
    const seg=getSegunda(hoje); const dias=Array.from({length:5},(_,i)=>addDays(seg,i));
    return minhas.filter(r=>dias.includes(r.data)&&r?.status!=="recusado");
  },[minhas,hoje]);

  const todasSemana = useMemo(()=>{
    const seg=getSegunda(hoje); const dias=Array.from({length:5},(_,i)=>addDays(seg,i));
    // CORREÇÃO: guarda r?.professor
    return todasReservas.filter(r=>r?.professor&&dias.includes(r.data)&&r?.status!=="recusado");
  },[todasReservas,hoje]);

  const todasMinhas=[...minhas].sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1);
  const ehMeuAgenda=(r)=>r.professorId===usuario.uid||r.professor===usuario.nome;
  const todasAgenda=filtroGrade==="todos"?[...todasReservas].filter(r=>r?.professor&&r?.status!=="recusado").sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1):[...todasReservas].filter(r=>r?.professor&&ehMeuAgenda(r)&&r?.status!=="recusado").sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1);
  const agendaFiltrada=todasAgenda.filter(r=>(!filtroEspacoGrade||r.espaco===filtroEspacoGrade));
  const futuras=agendaFiltrada.filter(r=>r.data>=hoje);
  const passadas=(filtroGrade==="meus"?todasMinhas:[]).filter(r=>r.data<hoje).reverse();
  const porData={}; futuras.forEach(r=>{ if(!porData[r.data])porData[r.data]=[]; porData[r.data].push(r); });
  const sc=(s)=>s==="confirmado"?"#1a6b47":s==="pendente"?"#d97706":"#dc2626";

  const RRow=({r})=>{
    const isMeuR=r.professorId===usuario.uid;
    const isPendR=r.status==="pendente";
    const bgR=isMeuR?(isPendR?"rgba(255,247,237,.8)":C.greenBg):C.surface;
    const borderR=isMeuR?(isPendR?C.amberBorder:C.greenBorder):"#cbd5e1";
    const borderLeft=isMeuR?(isPendR?C.amber:C.green):"#94a3b8";
    return (
    <div className="row-hover" style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:bgR, border:`1px solid ${borderR}`, marginBottom:4, borderLeft:`3px solid ${borderLeft}` }}>
      <span style={{ fontSize:13, fontFamily:"'DM Mono',monospace", fontWeight:800, color:isMeuR?(isPendR?C.amber:C.green):"#64748b", minWidth:42, flexShrink:0 }}>{r.horario}</span>
      <div style={{ width:1, height:32, background:C.borderLight, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
          <span style={{ fontWeight:700, fontSize:13, color:C.navy }}>{r.espaco}</span>
          <span style={{ fontSize:11, color:C.textMuted }}>·</span>
          <span style={{ fontSize:12, color:C.textMid }}>{fmtTurma(r.turma)}</span>
          {extraInfo(r)&&<span style={{ fontSize:11, background:"#e2f4ea", color:"#0f4c2b", border:"1px solid #86efac", borderRadius:6, padding:"1px 6px", fontWeight:700 }}>{extraInfo(r)}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          {isPendR
            ? <span style={{ fontSize:11.5, fontWeight:800, background:C.amberBg, color:C.amber, border:`1.5px solid ${C.amberBorder}`, borderRadius:20, padding:"2px 10px" }}>⏳ Pendente</span>
            : <Badge status={r.status} />
          }
          <span style={{ fontSize:12, color:C.textMuted }}>{r.professor}</span>
          {r.laboratorista==="Sim"&&<span style={{ fontSize:10.5, color:C.textMuted }}>🔬 Lab</span>}
          {r.quantidade&&<span style={{ fontSize:10.5, color:C.textMuted }}>🖥️ {r.quantidade}</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:4, flexShrink:0 }}>
        {r.data>=hoje&&r.status!=="recusado"&&(
          <button onClick={()=>setEditando(r)} title="Editar agendamento" style={{ background:"none", border:"1px solid transparent", borderRadius:7, color:C.textMuted, cursor:"pointer", fontSize:14, padding:"5px 8px", display:"flex", alignItems:"center", gap:4, transition:"all .15s" }}
            onMouseEnter={e=>{e.currentTarget.style.background=C.greenBg;e.currentTarget.style.borderColor=C.greenBorder;e.currentTarget.style.color=C.green;}}
            onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="transparent";e.currentTarget.style.color=C.textMuted;}}>
            ✏️ <span style={{ fontSize:11, fontWeight:600 }}>Editar</span>
          </button>
        )}
        {r.data>=hoje&&r.status!=="recusado"&&(
          <button onClick={()=>cancelar(r.id)} title="Cancelar reserva" style={{ background:"none", border:"1px solid transparent", borderRadius:7, color:C.textMuted, cursor:"pointer", fontSize:14, padding:"5px 8px", display:"flex", alignItems:"center", gap:4, transition:"all .15s" }}
            onMouseEnter={e=>{e.currentTarget.style.background=C.redBg;e.currentTarget.style.borderColor=C.redBorder;e.currentTarget.style.color=C.red;}}
            onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="transparent";e.currentTarget.style.color=C.textMuted;}}>
            ✕ <span style={{ fontSize:11, fontWeight:600 }}>Cancelar</span>
          </button>
        )}
      </div>
    </div>
  );};

  if (sucesso!==null) return (
    <div style={{ maxWidth:600, margin:"0 auto", padding:"24px 16px" }}>
      {sucesso.status==="pendente" ? (
        <div className="fade-in">
          {/* Card âmbar — pendente */}
          <div style={{ background:C.amberBg, border:`1.5px solid ${C.amberBorder}`, borderRadius:16, padding:"28px 24px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
              <div style={{ width:52,height:52,borderRadius:"50%",background:"#f97316",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>⏳</div>
              <div>
                <h3 style={{ fontSize:18, fontWeight:800, color:C.amber }}>Agendamento registrado como pendente</h3>
                <p style={{ fontSize:13, color:C.amber, opacity:.85, marginTop:2 }}>
                  {sucesso.motivo==="fimSemana"?"Agendamento em fim de semana":sucesso.motivo==="urgente"?"Menos de 24h de antecedência":"Fim de semana e menos de 24h"}
                </p>
              </div>
            </div>
            <div style={{ background:"rgba(255,255,255,.6)", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.navy, marginBottom:6 }}>📍 {espacoSel} · 📅 {dataSel.split("-").reverse().join("/")}</p>
              {blocos.map((b,i)=><p key={i} style={{ fontSize:12.5, color:C.textMid }}>🕐 {b.horario} · {b.turma}</p>)}
            </div>
            <div style={{ borderTop:`1px solid ${C.amberBorder}`, paddingTop:14 }}>
              <p style={{ fontSize:13, fontWeight:800, color:C.amber, marginBottom:8 }}>⚠️ O que você precisa fazer agora:</p>
              <p style={{ fontSize:13, color:"#92400e", lineHeight:1.65 }}>
                {sucesso.motivo==="fimSemana"
                  ? "Este agendamento está pendente pois ocorre em um fim de semana. Ele só será confirmado após aprovação do administrador — aguarde o retorno antes de usar o espaço."
                  : "Este agendamento tem menos de 24h de antecedência. O espaço ou equipamento precisa ser preparado com antecedência pelo T.E. (Tecnologia Educacional). Entre em contato imediatamente com o T.E. para avisar sobre o uso — sem esse aviso, o espaço pode não estar pronto no horário."
                }
              </p>
            </div>
          </div>
          <button onClick={resetForm} style={{ width:"100%", padding:"13px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.surface, color:C.navy, fontWeight:700, cursor:"pointer", fontSize:14 }}>← Voltar ao início</button>
        </div>
      ) : (
        <div className="fade-in" style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:16, padding:"40px 28px", textAlign:"center" }}>
          <div style={{ width:64,height:64,borderRadius:"50%",background:"#1a6b47",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px" }}>✓</div>
          <h3 style={{ fontSize:20, fontWeight:800, color:C.green, marginBottom:6 }}>{blocos.length>1?`${blocos.length} agendamentos confirmados!`:"Agendamento confirmado!"}</h3>
          <p style={{ fontSize:13.5, color:C.green, marginBottom:8 }}>📍 {espacoSel} · 📅 {dataSel.split("-").reverse().join("/")}</p>
          {blocos.map((b,i)=><p key={i} style={{ fontSize:13, color:C.green, opacity:.8 }}>🕐 {b.horario} · {b.turma}</p>)}
          <button onClick={resetForm} style={{ marginTop:24, padding:"11px 24px", borderRadius:10, border:"none", background:"#1a6b47", color:"#fff", fontWeight:800, cursor:"pointer", fontSize:14 }}>Voltar ao início</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"16px 16px 60px" }}>
      {editando&&<ModalEdicao reserva={editando} isAdmin={false} onClose={()=>setEditando(null)} onSave={()=>setEditando(null)} />}
      {mostrarResumo&&<ModalResumo espaco={espacoSel} data={dataSel} blocos={blocos} onConfirmar={handleSalvar} onCancelar={()=>setMostrarResumo(false)} salvando={salvando} C={C} />}
      {alertaUrgente&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
          <div className="fade-in" style={{ background:"#fff", borderRadius:16, padding:"28px 24px", width:"100%", maxWidth:420, boxShadow:"0 24px 60px rgba(0,0,0,.25)" }}>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>⚠️</div>
              <h3 style={{ fontSize:16, fontWeight:800, color:"#92400e", marginBottom:8 }}>Agendamento de curto prazo</h3>
              <p style={{ fontSize:13, color:"#78350f", lineHeight:1.6 }}>
                Este agendamento ficará <strong>pendente</strong> até o administrador aprovar. O espaço <strong>não estará garantido</strong> sem a aprovação.
              </p>
              <p style={{ fontSize:12.5, color:"#92400e", marginTop:8, lineHeight:1.5 }}>
                Contate a administração do colégio para confirmar o uso.
              </p>
              <p style={{ fontSize:12, color:"#b45309", fontStyle:"italic", marginTop:6 }}>Deseja continuar mesmo assim?</p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setAlertaUrgente(null)} style={{ flex:1, padding:"11px", borderRadius:8, border:"1.5px solid #c7dfd4", background:"transparent", color:"#132318", fontWeight:700, fontSize:13, cursor:"pointer" }}>← Cancelar</button>
              <button onClick={()=>{ setDataSel(alertaUrgente); setBlocos([blocoVazio()]); setAlertaUrgente(null); setTimeout(()=>document.getElementById("seletor-espaco")?.scrollIntoView({behavior:"smooth",block:"center"}),120); }} style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background:"#1a6b47", color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer" }}>Sim, continuar →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Boas-vindas ── */}
      {(()=>{
        const hr=new Date().getHours();
        const saudacao=hr<12?"Bom dia":"hr"<18?"Boa tarde":"Boa noite";
        const primeiroNome=usuario.nome?.split(" ")[0]||"Professor";
        return (
          <div style={{ marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div>
              <p style={{ fontSize:20, fontWeight:800, color:C.navy }}>{hr<12?"Bom dia":hr<18?"Boa tarde":"Boa noite"}, {primeiroNome}! 👋</p>
              <p style={{ fontSize:13, color:C.textMuted, marginTop:2 }}>Veja seus agendamentos ou reserve um espaço abaixo.</p>
            </div>
            {pendentes.length>0&&(
              <div onClick={()=>setModoCard("agenda")} style={{ background:C.amberBg, border:`1px solid ${C.amberBorder}`, borderRadius:10, padding:"8px 14px", display:"flex", alignItems:"center", gap:8, cursor:"pointer", transition:"opacity .15s" }}
                onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
                onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                <span style={{ fontSize:18 }}>⏳</span>
                <div>
                  <p style={{ fontSize:12, fontWeight:800, color:C.amber }}>{pendentes.length} agendamento{pendentes.length!==1?"s":""} pendente{pendentes.length!==1?"s":""}</p>
                  <p style={{ fontSize:11, color:C.amber, opacity:.8 }}>Toque para ver →</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Toggle Calendário/Agenda + label acima do card */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <p style={{ fontSize:13, fontWeight:700, color:C.textMid }}>Agendamentos</p>
        <div style={{ display:"flex", background:C.surface, border:`1px solid ${C.border}`, borderRadius:9, padding:2, gap:1 }}>
          {[{id:"calendario",label:"📅 Calendário"},{id:"agenda",label:"☰ Agenda"}].map(op=>(
            <button key={op.id} onClick={()=>setModoCard(op.id)} style={{ padding:"5px 13px", borderRadius:7, border:"none", background:modoCard===op.id?"#1a6b47":"transparent", color:modoCard===op.id?"#fff":C.textMid, fontWeight:700, fontSize:12, cursor:"pointer", transition:"all .15s" }}>{op.label}</button>
          ))}
        </div>
      </div>

      {/* Card de agendamentos com calendário */}
      <div style={{ background:C.surface, borderRadius:14, marginBottom:20, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:C.cardShadow }}>
        {diaMesSel ? (
          /* ══ VISÃO DE DIA — substitui o calendário ao clicar ══ */
          <div className="fade-in">
            {/* Header verde do dia */}
            <div style={{ background:"#1a6b47", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={()=>setDiaMesSel(null)} style={{ background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.3)", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, padding:"6px 12px", cursor:"pointer" }}>‹ Voltar</button>
                <div>
                  <p style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,.65)", textTransform:"uppercase", letterSpacing:".5px" }}>Agendamentos do dia</p>
                  <p style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{(()=>{ const [ano,m,dia]=diaMesSel.split("-"); const nd=["Dom.","Seg.","Ter.","Qua.","Qui.","Sex.","Sáb."][new Date(Date.UTC(+ano,+m-1,+dia)).getUTCDay()]; return `${nd} ${dia}/${m}/${ano}`; })()}</p>
                </div>
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={()=>setDiaMesSel(addDays(diaMesSel,-1))} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", borderRadius:7, color:"#fff", fontSize:15, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                <button onClick={()=>setDiaMesSel(addDays(diaMesSel,1))} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", borderRadius:7, color:"#fff", fontSize:15, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
              </div>
            </div>
            {/* Banner urgente — logo abaixo do header verde */}
            {(!isDiaLetivo(diaMesSel)||eDiaUrgente(diaMesSel))&&(
              <div style={{ background:!isDiaLetivo(diaMesSel)?"#fef2f2":"#fff7ed", borderBottom:`2px solid ${!isDiaLetivo(diaMesSel)?"#fca5a5":"#f97316"}`, padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{!isDiaLetivo(diaMesSel)?"🚫":"⚠️"}</span>
                <div>
                  <p style={{ fontSize:12.5, fontWeight:800, color:"#92400e" }}>Menos de 24h de antecedência</p>
                  <p style={{ fontSize:12, color:"#78350f", lineHeight:1.4 }}>Agendamentos neste dia ficam <strong>pendentes</strong> até aprovação. Contate a administração para garantir o espaço.</p>
                </div>
              </div>
            )}
            {/* Corpo */}
            <div style={{ padding:"14px 16px" }}>
              {(()=>{
                const todasFonteDia=(filtroGrade==="meus"
                  ?todasReservas.filter(r=>r?.professor&&r.professorId===usuario.uid&&r?.status!=="recusado")
                  :todasReservas.filter(r=>r?.professor&&r?.status!=="recusado")
                ).filter(r=>!filtroEspacoGrade||r.espaco===filtroEspacoGrade);
                const rsDia=todasFonteDia.filter(r=>r.data===diaMesSel).sort((a,b)=>a.horario>b.horario?1:-1);
                const meusDia=rsDia.filter(r=>r.professorId===usuario.uid);
                return (<>
                  {/* Resumo */}
                  {rsDia.length>0&&(
                    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, fontWeight:700, background:C.greenBg, color:C.green, border:`1px solid ${C.greenBorder}`, borderRadius:20, padding:"3px 10px" }}>{meusDia.length} meu{meusDia.length!==1?"s":""}</span>
                      {rsDia.length>meusDia.length&&<span style={{ fontSize:11, fontWeight:700, background:C.bg, color:C.textMid, border:`1px solid ${C.border}`, borderRadius:20, padding:"3px 10px" }}>{rsDia.length} no total</span>}
                    </div>
                  )}
                  {/* Lista */}
                  {rsDia.length===0 ? (
                    <div style={{ textAlign:"center", padding:"20px 0 12px" }}>
                      <p style={{ fontSize:32, marginBottom:8 }}>🗓️</p>
                      <p style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:4 }}>Dia livre!</p>
                      <p style={{ fontSize:12, color:C.textMuted }}>Nenhum agendamento neste dia.</p>
                    </div>
                  ) : (
                    <div style={{ display:"grid", gap:5, marginBottom:14 }}>
                      {rsDia.map((r,ri)=>{ const isMeu=r.professorId===usuario.uid; const isPend=r.status==="pendente"; return (
                        <div key={r.id||ri} style={{ display:"flex", gap:10, alignItems:"center", padding:"8px 12px", borderRadius:9, background:isMeu?(isPend?C.amberBg:C.greenBg):C.bg, border:`1px solid ${isMeu?(isPend?C.amberBorder:C.greenBorder):C.borderLight}`, borderLeft:`3px solid ${isMeu?(isPend?C.amber:C.green):C.borderLight}` }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, fontSize:12, minWidth:40, color:isMeu?(isPend?C.amber:C.green):C.textMid }}>{r.horario}</span>
                          <span style={{ fontWeight:700, fontSize:13, flex:1, color:C.navy, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.espaco}</span>
                          <span style={{ fontSize:11, color:C.textMuted }}>{r.turma}</span>
                          {!isMeu&&filtroGrade==="todos"&&<span style={{ fontSize:10, color:C.textMuted, fontStyle:"italic" }}>{r.professor.split(" ")[0]}</span>}
                          {isMeu&&isPend&&<span style={{ fontSize:10, fontWeight:700, background:C.amberBg, border:`1px solid ${C.amberBorder}`, color:C.amber, borderRadius:8, padding:"1px 6px" }}>⏳</span>}
                        </div>
                      ); })}
                    </div>
                  )}
                  {/* Botão de agendar — só para dias futuros */}
                  {diaMesSel>=hoje&&(
                    <div style={{ borderTop:`1px solid ${C.borderLight}`, paddingTop:14, marginTop:4 }}>

                      {!isDiaLetivo(diaMesSel)
                        ? <div style={{ width:"100%", padding:"13px", borderRadius:10, background:"#fef2f2", border:"1.5px solid #fca5a5", color:"#b91c1c", fontWeight:700, fontSize:13, textAlign:"center" }}>🚫 Agendamento não permitido neste dia</div>
                        : <button onClick={()=>{ setDiaMesSel(null); agendarDia(diaMesSel); }} style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:eDiaUrgente(diaMesSel)?"#d97706":"#1a6b47", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:`0 4px 12px rgba(${eDiaUrgente(diaMesSel)?"217,119,6":"26,107,71"},.35)`, transition:"opacity .15s" }}
                            onMouseEnter={e=>e.currentTarget.style.opacity=".9"}
                            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                            {eDiaUrgente(diaMesSel)?"⚠️ Agendar mesmo assim":"+ Agendar neste dia"}
                          </button>
                      }
                    </div>
                  )}
                </>);
              })()}
            </div>
          </div>
        ) : (
        <>
        {/* Banner verde — navegação e filtros, só aparece no modo calendário */}
        {modoCard==="calendario"&&(
          <div className="banner-prof">
            {/* Navegação semana */}
            {modoVisu==="semana"&&(<>
              <div className="banner-prof-nav">
                <button onClick={()=>setSemanaInicio(s=>addDays(s,-7))} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", borderRadius:7, color:"#fff", fontSize:15, width:30, height:30, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>‹</button>
                <p style={{ fontSize:12, fontWeight:700, color:"#fff", minWidth:72, textAlign:"center" }}>{(()=>{ const fim=addDays(semanaInicio,4); const [,ma,da]=semanaInicio.split("-"); const [,mb,db]=fim.split("-"); return ma===mb?`${da}–${db}/${mb}`:`${da}/${ma}–${db}/${mb}`; })()}</p>
                <button onClick={()=>setSemanaInicio(s=>addDays(s,7))} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.25)", borderRadius:7, color:"#fff", fontSize:15, width:30, height:30, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>›</button>
              </div>
              <div style={{ width:1, height:20, background:"rgba(255,255,255,.2)", margin:"0 2px", flexShrink:0 }} />
            </>)}
            {/* Semana / Mês */}
            <div style={{ display:"flex", background:"rgba(0,0,0,.18)", borderRadius:8, padding:2 }}>
              {[{id:"semana",label:"Semana"},{id:"mes",label:"Mês"}].map(op=>(
                <button key={op.id} onClick={()=>setModoVisu(op.id)} style={{ padding:"5px 11px", borderRadius:6, border:"none", background:modoVisu===op.id?"#fff":"transparent", color:modoVisu===op.id?"#1a6b47":"rgba(255,255,255,.85)", fontWeight:700, fontSize:12, cursor:"pointer" }}>{op.label}</button>
              ))}
            </div>
            {/* Meus / Todos */}
            <div style={{ display:"flex", background:"rgba(0,0,0,.18)", borderRadius:8, padding:2 }}>
              {[{id:"meus",label:"Meus"},{id:"todos",label:"Todos"}].map(op=>(
                <button key={op.id} onClick={()=>setFiltroGrade(op.id)} style={{ padding:"5px 11px", borderRadius:6, border:"none", background:filtroGrade===op.id?"#fff":"transparent", color:filtroGrade===op.id?"#1a6b47":"rgba(255,255,255,.85)", fontWeight:700, fontSize:12, cursor:"pointer" }}>{op.label}</button>
              ))}
            </div>
            {/* Espaço */}
            <select value={filtroEspacoGrade} onChange={e=>setFiltroEspacoGrade(e.target.value)} style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.2)", borderRadius:7, color:"#fff", fontWeight:600, fontSize:11.5, cursor:"pointer", outline:"none", padding:"5px 8px", maxWidth:150 }}>
              <option value="" style={{ background:"#1a6b47" }}>Espaços</option>
              {ESPACOS.map(e=><option key={e.id} value={e.nome} style={{ background:"#1a6b47" }}>{e.nome}</option>)}
            </select>
            {/* Legenda — linha separada quando Todos */}
            {filtroGrade==="todos"&&(
              <div style={{ width:"100%", display:"flex", gap:14, alignItems:"center" }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,.65)" }}>Legenda:</span>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:16, height:16, borderRadius:3, background:"#e2f4ea", border:"2px solid #6ee7a0", flexShrink:0 }} />
                  <span style={{ fontSize:11, color:"rgba(255,255,255,.9)", fontWeight:600 }}>Meus</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:16, height:16, borderRadius:3, background:"#ffffff", border:"2px solid #94a3b8", flexShrink:0 }} />
                  <span style={{ fontSize:11, color:"rgba(255,255,255,.9)", fontWeight:600 }}>Outros</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:16, height:16, borderRadius:3, background:"#fff7ed", border:"2px solid #fed7aa", flexShrink:0 }} />
                  <span style={{ fontSize:11, color:"rgba(255,255,255,.9)", fontWeight:600 }}>⏳ Pendente</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Corpo branco */}
        <div className="prof-card">

        {/* Modo CALENDÁRIO */}
        {modoCard==="calendario"&&modoVisu==="semana"&&(()=>{
          const diasSemana=Array.from({length:5},(_,i)=>addDays(semanaInicio,i)); const nomesDia=["Seg.","Ter.","Qua.","Qui.","Sex."];
          const ehMeu=(r)=>r.professorId===usuario.uid||r.professor===usuario.nome;
          const todasFonte=(filtroGrade==="meus"
            ?todasReservas.filter(r=>r?.professor&&ehMeu(r)&&r?.status!=="recusado")
            :todasReservas.filter(r=>r?.professor&&r?.status!=="recusado")
          ).filter(r=>!filtroEspacoGrade||r.espaco===filtroEspacoGrade);
          const fonte=todasFonte.filter(r=>diasSemana.includes(r.data));
          const porDataSemana={};
          todasFonte.forEach(r=>{ if(!porDataSemana[r.data])porDataSemana[r.data]=[]; porDataSemana[r.data].push(r); });
          return (
            <div>
              <div className="semana-grid">
                {diasSemana.map((d,i)=>{
                  const [,,dia]=d.split("-"); const isHoje=d===hoje; const isSel=d===diaMesSel;
                  const rsDodia=fonte.filter(r=>r.data===d).sort((a,b)=>a.horario>b.horario?1:-1);
                  const ehMeuLocal=(r)=>r.professorId===usuario.uid||r.professor===usuario.nome;
                  return (
                    <div key={d} className="semana-dia" onClick={()=>setDiaMesSel(isSel?null:d)} style={{ background:isSel?C.greenBg:isHoje?"rgba(26,107,71,.06)":C.bg, border:`1px solid ${isSel?C.greenBorder:isHoje?C.blueMid:C.borderLight}`, borderRadius:10, padding:"10px 8px", minHeight:80, cursor:"pointer", transition:"all .15s", flex:"1 1 0" }}>
                      {(()=>{ const dowD=new Date(d).getDay(); const naoLetivo=!isDiaLetivo(d)&&d>=hoje&&dowD!==0&&dowD!==6; return (
                      <div style={{ textAlign:"center", marginBottom:6, background:naoLetivo?"rgba(239,68,68,.07)":"transparent", borderRadius:6, padding:naoLetivo?"2px 0":"0" }}>
                        <p style={{ fontSize:10, fontWeight:700, color:naoLetivo?"#ef4444":C.textMuted, textTransform:"uppercase", letterSpacing:".3px" }}>{nomesDia[i]}</p>
                        <p style={{ fontSize:18, fontWeight:900, lineHeight:1, color:isHoje?C.blueMid:naoLetivo?"#ef4444":C.navy }}>{dia}</p>
                        {isHoje&&!naoLetivo&&<div style={{ width:4, height:4, borderRadius:"50%", background:C.blueMid, margin:"3px auto 0" }} />}
                        {naoLetivo&&<p style={{ fontSize:8, fontWeight:700, color:"#ef4444", marginTop:2, lineHeight:1 }}>não letivo</p>}
                      </div>
                      ); })()}
                      {rsDodia.length===0 ? <p style={{ fontSize:9, color:C.textMuted, opacity:.5, textAlign:"center", marginTop:4 }}>—</p> : (
                        <div style={{ display:"grid", gap:3 }}>
                          {rsDodia.map(r=>{ const isMeu=ehMeuLocal(r); const isPend=r.status==="pendente"; return (
                            <div key={r.id||r.horario} style={{ background:isMeu?C.greenBg:C.surface, borderRadius:5, padding:"3px 5px", border:`1px solid ${isMeu?C.greenBorder:C.border}`, borderLeft:`3px solid ${isMeu?C.green:"#94a3b8"}` }}>
                              <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
                                <p style={{ fontSize:10, fontWeight:800, fontFamily:"'DM Mono',monospace", color:isMeu?C.green:"#64748b", flexShrink:0 }}>{r.horario}</p>
                                <p style={{ fontSize:10, fontWeight:700, color:C.navy, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.espaco.split(" ")[0]}</p>
                                {isMeu&&isPend&&<span style={{ fontSize:9, fontWeight:700, color:C.amber, flexShrink:0 }}>⏳ pend.</span>}
                              </div>
                              <p style={{ fontSize:9, color:C.textMuted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{fmtTurma(r.turma)} · {nomeProf(r.professor)}</p>
                            </div>
                          ); })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {diaMesSel&&diasSemana.includes(diaMesSel)&&(
                <div className="fade-in" style={{ marginTop:10, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
                  <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:8 }}>{diaMesSel.split("-").reverse().join("/")}</p>
                  {(porDataSemana[diaMesSel]||[]).length===0 ? <p style={{ fontSize:12, color:C.textMuted, marginBottom:10 }}>🎉 Nenhum agendamento neste dia.</p> : (
                    <div style={{ display:"grid", gap:4, marginBottom:10 }}>
                      {(porDataSemana[diaMesSel]||[]).sort((a,b)=>a.horario>b.horario?1:-1).map((r,ri)=>{ const isMeu=r.professorId===usuario.uid; return (
                        <div key={r.id||ri} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 10px", borderRadius:7, background:isMeu?C.greenBg:C.surface, border:`1px solid ${isMeu?C.greenBorder:C.borderLight}`, borderLeft:`3px solid ${isMeu?C.green:C.borderLight}` }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, fontSize:11, minWidth:38, color:C.blueMid }}>{r.horario}</span>
                          <span style={{ fontWeight:700, fontSize:11, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:C.navy }}>{r.espaco}</span>
                          <span style={{ fontSize:10, color:C.textMuted }}>{r.turma}</span>
                          {filtroGrade==="todos"&&<span style={{ fontSize:10, color:C.textMuted }}>{r.professor.split(" ")[0]}</span>}
                        </div>
                      ); })}
                    </div>
                  )}
                  {diaMesSel>=hoje&&(
                    <div style={{ borderTop:`1px solid ${C.borderLight}`, paddingTop:10, marginTop:4 }}>
                      {!espacoSel ? (
                        <div>
                          <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:8 }}>Agendar neste dia — selecione o espaço:</p>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                            <select defaultValue="" onChange={e=>{ if(!e.target.value) return; setDiaMesSel(null); setEspacoSel(e.target.value); agendarDia(diaMesSel); setTimeout(()=>document.getElementById("seletor-espaco")?.scrollIntoView({behavior:"smooth"}),100); }} style={{ flex:1, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.navy, fontWeight:600, fontSize:12.5, cursor:"pointer", outline:"none", minWidth:180 }}>
                              <option value="">Selecione o espaço...</option>
                              <optgroup label="🏛️ Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                              <optgroup label="🔬 Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                              <optgroup label="💻 Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                          <p style={{ fontSize:12, fontWeight:700, color:C.navy }}>Agendar em <strong>{espacoSel}</strong> neste dia?</p>
                          <button onClick={()=>{ setDiaMesSel(null); agendarDia(diaMesSel); setTimeout(()=>document.getElementById("seletor-espaco")?.scrollIntoView({behavior:"smooth"}),100); }} style={{ padding:"7px 14px", borderRadius:8, border:"none", background:"#1a6b47", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer" }}>Sim ✓</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {fonte.length===0&&<p style={{ fontSize:13, color:C.textMuted, textAlign:"center", marginTop:8 }}>Nenhum agendamento esta semana</p>}
              <p style={{ fontSize:10, color:C.textMuted, opacity:.7, textAlign:"right", marginTop:6 }}>Clique no dia para detalhes</p>
            </div>
          );
        })()}

        {/* Modo MÊS */}
        {modoCard==="calendario"&&modoVisu==="mes"&&(()=>{
          // CORREÇÃO: guarda r?.professor + NÃO desestrutura no .map() (era o bug principal)
          const ehMeuMes=(r)=>r.professorId===usuario.uid||r.professor===usuario.nome;
          const fonte=(filtroGrade==="meus"
            ?todasReservas.filter(r=>r?.professor&&ehMeuMes(r)&&r?.status!=="recusado")
            :todasReservas.filter(r=>r?.professor&&r?.status!=="recusado")
          ).filter(r=>!filtroEspacoGrade||r.espaco===filtroEspacoGrade);
          const porDataMes={}; fonte.forEach(r=>{ if(!porDataMes[r.data])porDataMes[r.data]=[]; porDataMes[r.data].push(r); });
          const ano=mesProfCal.a, mes=mesProfCal.m;
          const nomeMes=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mes];
          const navMesPRof=(dir)=>{ setMesProfCal(({a,m})=>{ let nm=m+dir,na=a; if(nm>11){nm=0;na++;} if(nm<0){nm=11;na--;} return {a:na,m:nm}; }); setDiaMesSel(null); };
          const primeiroDia=new Date(Date.UTC(ano,mes,1)); const diasNoMes=new Date(Date.UTC(ano,mes+1,0)).getUTCDate(); const inicioGrid=primeiroDia.getUTCDay();
          const cells=[]; for(let i=0;i<inicioGrid;i++)cells.push(null); for(let d=1;d<=diasNoMes;d++)cells.push(d);
          return (
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <button onClick={()=>navMesPRof(-1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                <p style={{ fontSize:13, fontWeight:800, color:C.navy }}>{nomeMes} {ano}</p>
                <button onClick={()=>navMesPRof(1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:30, height:30, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
                {["D","S","T","Q","Q","S","S"].map((n,i)=><div key={i} style={{ textAlign:"center", fontSize:9.5, fontWeight:700, color:C.textMuted, padding:"2px 0" }}>{n}</div>)}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                {cells.map((d,i)=>{
                  if (!d) return <div key={i} />;
                  const dateStr=`${ano}-${String(mes+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                  const isHoje=dateStr===hoje, isPast=dateStr<hoje;
                  // CORREÇÃO: usa diaMesSel diretamente — sem desestruturação inválida
                  const isSel=dateStr===diaMesSel;
                  const rs=porDataMes[dateStr]||[];
                  const dowMes=new Date(+ano,+mes-1,+d).getDay();
                  const isFimSemMes=dowMes===0||dowMes===6;
                  const mesInteiroBloqueado=Array.from({length:28},(_,i)=>i+1).every(dd=>DIAS_NAO_LETIVOS.has(`${ano}-${String(mes+1).padStart(2,"0")}-${String(dd).padStart(2,"0")}`));
                  const naoLetivoMes=!isDiaLetivo(dateStr)&&!isPast&&(!isFimSemMes||mesInteiroBloqueado);
                  const borderColor=isSel?C.greenBorder:isHoje?C.blueMid:isPast?"#e2e8f0":naoLetivoMes?"#fca5a5":C.borderLight;
                  const bgColor=isSel?C.greenBg:isHoje?"rgba(26,107,71,.05)":isPast?"rgba(0,0,0,.018)":naoLetivoMes?"rgba(239,68,68,.05)":C.surface;
                  return (
                    <button key={i} onClick={()=>setDiaMesSel(isSel?null:dateStr)} style={{ borderRadius:8, border:`1px solid ${borderColor}`, cursor:"pointer", background:bgColor, transition:"all .15s", display:"flex", flexDirection:"column", alignItems:"center", padding:"6px 3px", gap:2, minHeight:52 }}>
                      <span style={{ fontWeight:isHoje||isSel?900:500, fontSize:13, lineHeight:1, color:isPast?"#b0bec5":isHoje?C.blueMid:naoLetivoMes?"#ef4444":C.navy }}>{d}</span>
                      {naoLetivoMes&&<span style={{ fontSize:7, fontWeight:700, color:"#ef4444", lineHeight:1 }}>não letivo</span>}
                      {isPast&&!isSel&&<span style={{ fontSize:7, fontWeight:600, color:"#b0bec5", lineHeight:1 }}>histórico</span>}
                      {rs.length>0&&(
                        <div style={{ display:"grid", gap:1, width:"100%" }}>
                          {[...new Map(rs.map(r=>[r.professorId,r])).values()].slice(0,2).map(r=>{
                            const isMeu=r.professorId===usuario.uid;
                            return <div key={r.professorId} style={{ background:isMeu?C.greenBg:"rgba(26,107,71,.06)", border:`1px solid ${isMeu?C.greenBorder:C.borderLight}`, borderRadius:3, padding:"1px 3px", overflow:"hidden" }}><p style={{ fontSize:7.5, fontWeight:800, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textAlign:"center", color:isMeu?C.green:C.textMid }}>{r.professor.split(" ")[0]}</p></div>;
                          })}
                          {[...new Map(rs.map(r=>[r.professorId,r])).values()].length>2&&<p style={{ fontSize:7, color:C.textMuted, textAlign:"center" }}>+{[...new Map(rs.map(r=>[r.professorId,r])).values()].length-2}</p>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {diaMesSel&&(
                <div className="fade-in" style={{ marginTop:12, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
                  <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:8 }}>{diaMesSel.split("-").reverse().join("/")}</p>
                  {(porDataMes[diaMesSel]||[]).length===0 ? <p style={{ fontSize:12, color:C.textMuted, marginBottom:10 }}>🎉 Nenhum agendamento neste dia.</p> : (
                    <div style={{ display:"grid", gap:4, marginBottom:10 }}>
                      {(porDataMes[diaMesSel]||[]).sort((a,b)=>a.horario>b.horario?1:-1).map((r,ri)=>{ const isMeu=r.professorId===usuario.uid; return (
                        <div key={r.id||ri} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 10px", borderRadius:7, background:isMeu?C.greenBg:C.surface, border:`1px solid ${isMeu?C.greenBorder:C.borderLight}`, borderLeft:`3px solid ${isMeu?C.green:C.borderLight}` }}>
                          <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, fontSize:11, minWidth:38, color:C.blueMid }}>{r.horario}</span>
                          <span style={{ fontWeight:700, fontSize:11, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:C.navy }}>{r.espaco}</span>
                          <span style={{ fontSize:10, color:C.textMuted }}>{r.turma}</span>
                          {filtroGrade==="todos"&&<span style={{ fontSize:10, color:C.textMuted }}>{r.professor.split(" ")[0]}</span>}
                        </div>
                      ); })}
                    </div>
                  )}
                  {diaMesSel>=hoje&&(
                    <div style={{ borderTop:`1px solid ${C.borderLight}`, paddingTop:10, marginTop:4 }}>
                      <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:8 }}>Agendar neste dia — selecione o espaço:</p>
                      <select defaultValue="" onChange={e=>{ if (!e.target.value) return; setDiaMesSel(null); setEspacoSel(e.target.value); agendarDia(diaMesSel); setTimeout(()=>document.getElementById("seletor-espaco")?.scrollIntoView({behavior:"smooth"}),100); }} style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.navy, fontWeight:600, fontSize:12.5, cursor:"pointer", outline:"none" }}>
                        <option value="">Selecione o espaço...</option>
                        <optgroup label="🏛️ Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                        <optgroup label="🔬 Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                        <optgroup label="💻 Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display:"flex", gap:12, marginTop:10, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:10, color:C.textMuted, marginLeft:"auto" }}>Clique no dia para detalhes</span>
              </div>
            </div>
          );
        })()}

        {/* Modo AGENDA */}
        {modoCard==="agenda"&&(
          <div className="fade-in">
            {/* Filtros da agenda */}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", padding:"10px 14px", background:"#1a6b47", borderBottom:`1px solid ${C.border}`, marginBottom:14, borderRadius:"10px 10px 0 0" }}>
              <div style={{ display:"flex", background:"rgba(0,0,0,.2)", borderRadius:8, padding:2 }}>
                {[{id:"meus",label:"Meus"},{id:"todos",label:"Todos"}].map(op=>(
                  <button key={op.id} onClick={()=>setFiltroGrade(op.id)} style={{ padding:"5px 12px", borderRadius:6, border:"none", background:filtroGrade===op.id?"#fff":"transparent", color:filtroGrade===op.id?"#1a6b47":"rgba(255,255,255,.85)", fontWeight:700, fontSize:12, cursor:"pointer", transition:"all .15s" }}>{op.label}</button>
                ))}
              </div>
              <select value={filtroEspacoGrade} onChange={e=>setFiltroEspacoGrade(e.target.value)} style={{ padding:"5px 10px", borderRadius:7, border:"1px solid rgba(255,255,255,.25)", background:"rgba(255,255,255,.12)", color:"#fff", fontWeight:600, fontSize:12, cursor:"pointer", outline:"none", flex:1, minWidth:140 }}>
                <option value="" style={{ background:"#1a6b47" }}>Todos os espaços</option>
                {ESPACOS.map(e=><option key={e.id} value={e.nome} style={{ background:"#1a6b47" }}>{e.nome}</option>)}
              </select>
              {filtroEspacoGrade&&<button onClick={()=>setFiltroEspacoGrade("")} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", borderRadius:7, color:"#fff", fontSize:12, padding:"5px 10px", cursor:"pointer" }}>✕</button>}
              {filtroGrade==="todos"&&(
                <div style={{ display:"flex", gap:8, alignItems:"center", marginLeft:"auto" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:"#e2f4ea", border:"1.5px solid #6ee7a0" }} />
                    <span style={{ fontSize:10, color:"rgba(255,255,255,.9)", fontWeight:700 }}>Meus</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:"#fff", border:"1.5px solid #94a3b8" }} />
                    <span style={{ fontSize:10, color:"rgba(255,255,255,.9)", fontWeight:700 }}>Outros</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:"#fff7ed", border:"1.5px solid #fed7aa" }} />
                    <span style={{ fontSize:10, color:"rgba(255,255,255,.9)", fontWeight:700 }}>⏳ Pend.</span>
                  </div>
                </div>
              )}
            </div>
            {futuras.length===0&&passadas.length===0?(
              <p style={{ fontSize:13, color:C.textMuted, textAlign:"center", padding:"24px 0" }}>Nenhum agendamento encontrado.</p>
            ):(
              <>
                {/* Seção de pendentes no topo */}
                {pendentes.length>0&&(
                  <div style={{ background:C.amberBg, border:`1.5px solid ${C.amberBorder}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <span style={{ fontSize:16 }}>⏳</span>
                      <p style={{ fontSize:13, fontWeight:800, color:C.amber }}>
                        {pendentes.length} agendamento{pendentes.length!==1?"s":""} pendente{pendentes.length!==1?"s":""} — aguardando aprovação
                      </p>
                    </div>
                    <div style={{ background:"rgba(255,255,255,.5)", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
                      <p style={{ fontSize:12, color:"#92400e", lineHeight:1.6 }}>
                        ⚠️ Estes agendamentos foram feitos com <strong>menos de 24h de antecedência</strong> ou em <strong>fim de semana</strong>. Para que o espaço ou equipamento esteja pronto, <strong>entre em contato com o T.E. (Tecnologia Educacional)</strong> o quanto antes e aguarde a confirmação antes de usar o espaço.
                      </p>
                    </div>
                    <div style={{ display:"grid", gap:5 }}>
                      {pendentes.sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1).map(r=>(
                        <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:C.surface, border:`1px solid ${C.amberBorder}`, borderLeft:`3px solid ${C.amber}` }}>
                          <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", fontWeight:800, color:C.amber, minWidth:38, flexShrink:0 }}>{r.horario}</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:700, color:C.navy, margin:0 }}>{r.espaco} · {fmtTurma(r.turma)}</p>
                            <p style={{ fontSize:11, color:C.textMuted, margin:0 }}>{r.data.split("-").reverse().join("/")} · {nomeProf(r.professor)}</p>
                          </div>
                          <button onClick={()=>cancelar(r.id)} style={{ background:"none", border:`1px solid ${C.redBorder}`, borderRadius:7, color:C.red, cursor:"pointer", fontSize:11, fontWeight:600, padding:"4px 8px", flexShrink:0 }}>Cancelar</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {futuras.length>0&&Object.entries(porData).map(([data,rs])=>{ const [ano,mes,dia]=data.split("-"); const isHoje=data===hoje; return (
                  <div key={data} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:isHoje?C.green:C.textMid, background:isHoje?C.greenBg:"transparent", padding:isHoje?"2px 8px":"0", borderRadius:isHoje?20:0 }}>{isHoje?"📌 Hoje":`${dia}/${mes}`}</span>
                      <div style={{ flex:1, height:1, background:C.borderLight }} />
                      <span style={{ fontSize:10, color:C.textMuted }}>{rs.length} reserva{rs.length!==1?"s":""}</span>
                    </div>
                    {rs.map(r=><RRow key={r.id} r={r} />)}
                  </div>
                ); })}
                {passadas.length>0&&(
                  <div style={{ marginTop:10, opacity:.55 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Histórico · {passadas.length}</p>
                    {passadas.slice(0,5).map(r=><RRow key={r.id} r={r} />)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </div>{/* fim corpo branco */}
        </>
        )}{/* fim diaMesSel ternário */}
      </div>

      {/* Meus próximos — só aparece no modo calendário */}
      {modoCard==="calendario"&&futuras.length>0&&(
        <div style={{ marginBottom:20, background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <p style={{ fontSize:13, fontWeight:800, color:C.navy }}>Meus próximos · {futuras.length}</p>
            {pendentes.length>0&&<span style={{ fontSize:11, fontWeight:700, background:C.amberBg, color:C.amber, border:`1px solid ${C.amberBorder}`, borderRadius:20, padding:"2px 9px" }}>⏳ {pendentes.length} pendente{pendentes.length!==1?"s":""}</span>}
          </div>
          <div style={{ padding:"12px 16px" }}>
            {Object.entries(porData).map(([data,rs])=>{ const [ano,mes,dia]=data.split("-"); const isHoje=data===hoje; return (
              <div key={data} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:isHoje?C.green:C.textMid, background:isHoje?C.greenBg:"transparent", padding:isHoje?"2px 8px":"0", borderRadius:isHoje?20:0 }}>{isHoje?"📌 Hoje":`${dia}/${mes}`}</span>
                  <div style={{ flex:1, height:1, background:C.borderLight }} />
                  <span style={{ fontSize:10, color:C.textMuted }}>{rs.length} reserva{rs.length!==1?"s":""}</span>
                </div>
                {rs.map(r=><RRow key={r.id} r={r} />)}
              </div>
            ); })}
            {passadas.length>0&&(
              <div style={{ opacity:.5, marginTop:12 }}>
                <p style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>Histórico · {passadas.length}</p>
                {passadas.slice(0,5).map(r=><RRow key={r.id} r={r} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seletor de espaço */}
      <div id="seletor-espaco" style={{ marginBottom:espacoSel?14:0 }}>
        {!espacoSel ? (
          <Field label="Selecione o espaço / equipamento" required>
            <select defaultValue="" onChange={e=>e.target.value&&setEspacoSel(e.target.value)} style={{...inp,cursor:"pointer",fontSize:14}}>
              <option value="" disabled>Selecione...</option>
              <optgroup label="🏛️ Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
              <optgroup label="🔬 Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
              <optgroup label="💻 Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            </select>
          </Field>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, border:`2px solid #40b07a`, borderRadius:10, padding:"10px 16px" }}>
            <span style={{ fontSize:20 }}>{tipoIcon(ESPACOS.find(e=>e.nome===espacoSel)?.tipo)}</span>
            <span style={{ fontSize:14, fontWeight:700, color:C.navy, flex:1 }}>{espacoSel}</span>
            <button onClick={()=>{ setEspacoSel(""); setDataSel(""); setBlocos([blocoVazio()]); }} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:12, fontWeight:600 }}>Trocar ✕</button>
          </div>
        )}
      </div>

      {/* Calendário mensal de seleção */}
      {espacoSel&&!dataSel&&(
        <div className="fade-in" style={{ marginTop:14 }}>
          <CalendarioMensal reservasPorData={reservasPorData} onSelectDia={(d)=>agendarDia(d)} dataSelecionada={dataSel} />
        </div>
      )}

      {/* Formulário multi-agendamento */}
      {espacoSel&&dataSel&&(
        <div className="fade-in" style={{ marginTop:14 }}>
          {eDiaUrgente(dataSel)&&(
            <div style={{ background:"#fff7ed", border:"2px solid #f97316", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
              <p style={{ fontSize:14, fontWeight:800, color:"#92400e", marginBottom:6 }}>⚠️ Menos de 24h de antecedência</p>
              <p style={{ fontSize:13, color:"#78350f", lineHeight:1.6 }}>
                Este agendamento tem menos de 24h de antecedência. <strong>Contate o T.E. (Tecnologia Educacional)</strong> para garantir que o espaço ou equipamento estará organizado e disponível no horário.
              </p>
            </div>
          )}
          <div style={{ background:`linear-gradient(135deg,#1a6b47,#0f4c2b)`, padding:"12px 16px", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.75)", fontWeight:700, textTransform:"uppercase", letterSpacing:".5px", marginBottom:2 }}>Agendando em</p>
              <p style={{ fontSize:15, fontWeight:800, color:"#fff" }}>{tipoIcon(ESPACOS.find(e=>e.nome===espacoSel)?.tipo)} {espacoSel} · {dataSel.split("-").reverse().join("/")}</p>
            </div>
            <button onClick={()=>{ setDataSel(""); setBlocos([blocoVazio()]); }} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, padding:"5px 10px", cursor:"pointer" }}>Trocar data ✕</button>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
            <Avatar nome={usuario.nome} variant="navy" />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:10, color:C.textMuted, fontWeight:600, textTransform:"uppercase" }}>Professor(a)</p>
              <p style={{ fontSize:14, fontWeight:700, color:C.navy }}>{usuario.nome}</p>
            </div>
            <span style={{ fontSize:11, background:C.greenBg, color:C.green, padding:"3px 10px", borderRadius:20, fontWeight:700 }}>Automático</span>
          </div>

          {erro&&<div style={{ marginBottom:14 }}><Alert type="error">{erro}</Alert></div>}

          <div style={{ display:"grid", gap:12 }}>
            {blocos.map((b,i)=>(
              <BlocoAgendamento key={b._key||i} idx={i} espaco={espacoSel} data={dataSel} bloco={b} onChange={onChange} onRemove={onRemove} ocupadosGlobal={blocos} C={C} inp={inp} sel={{...inp,cursor:"pointer"}} />
            ))}
          </div>

          {blocos.length<HORARIOS.length&&(
            <button onClick={addBloco} disabled={!blocoValido(blocos[blocos.length-1])} style={{ width:"100%", marginTop:10, padding:"11px", borderRadius:10, border:`2px dashed ${!blocoValido(blocos[blocos.length-1])?"#cbd5e1":"#40b07a"}`, background:"transparent", color:!blocoValido(blocos[blocos.length-1])?C.textMuted:"#40b07a", fontWeight:700, fontSize:13.5, cursor:!blocoValido(blocos[blocos.length-1])?"not-allowed":"pointer" }}>
              + Agendar outra turma neste dia
            </button>
          )}

          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={()=>{ setDataSel(""); setBlocos([blocoVazio()]); }} style={{ padding:"12px 18px", borderRadius:10, border:`1.5px solid ${C.border}`, background:"transparent", color:C.textMid, fontWeight:700, fontSize:13, cursor:"pointer" }}>← Alterar dia/espaço</button>
            <button onClick={()=>setMostrarResumo(true)} disabled={!todosValidos} style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:todosValidos?"#40b07a":"#cbd5e1", color:todosValidos?"#fff":"#94a3b8", fontWeight:800, fontSize:15, cursor:todosValidos?"pointer":"not-allowed", boxShadow:todosValidos?"0 4px 14px rgba(26,107,71,.35)":"none" }}>
              {todosValidos?`Confirmar e salvar ${blocos.length} agendamento${blocos.length>1?"s":""}`:"Preencha todos os campos"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function GerenciarUsuarios() {
  const C = useC(); const inp = useInp();
  const [usuarios,setUsuarios] = useState([]);
  const [form,setForm] = useState({nome:"",email:"",senha:""});
  const [editando,setEditando] = useState(null);
  const [erro,setErro] = useState(""); const [sucesso,setSucesso] = useState("");
  const [salvando,setSalvando] = useState(false);
  useEffect(()=>onSnapshot(collection(db,"usuarios"),(snap)=>setUsuarios(snap.docs.map((d)=>({id:d.id,...d.data()})).sort((a,b)=>(a.nome||"").localeCompare(b.nome||"")))),[]);
  const flash=(msg,tipo="sucesso")=>{ tipo==="sucesso"?(setSucesso(msg),setErro("")):(setErro(msg),setSucesso("")); setTimeout(()=>{setSucesso("");setErro("");},4000); };
  const handleCriar=async()=>{
    if (!form.nome||!form.email||!form.senha) return flash("Preencha todos os campos.","erro");
    if (form.senha.length<6) return flash("Senha mínima: 6 caracteres.","erro");
    setSalvando(true);
    try {
      const cred=await createUserWithEmailAndPassword(secondaryAuth,form.email,form.senha);
      await secondaryAuth.signOut();
      await setDoc(doc(db,"usuarios",cred.user.uid),{ nome:form.nome, email:form.email, perfil:form.email===ADMIN_EMAIL?"admin":"professor", ativo:true, criadoEm:Timestamp.now() });
      setForm({nome:"",email:"",senha:""}); flash(`Prof(a) ${form.nome} cadastrado(a)!`);
    } catch(e) { flash(e.code==="auth/email-already-in-use"?"E-mail já cadastrado.":"Erro ao cadastrar.","erro"); }
    finally { setSalvando(false); }
  };
  const salvarEdicao=async()=>{ if (!editando?.nome) return flash("Nome vazio.","erro"); setSalvando(true); try { await updateDoc(doc(db,"usuarios",editando.id),{nome:editando.nome}); setEditando(null); flash("Nome atualizado!"); } catch { flash("Erro.","erro"); } finally { setSalvando(false); } };
  const toggleAtivo=async(u)=>{ const n=!u.ativo; if (!window.confirm((n?"Habilitar":"Desabilitar")+" "+u.nome+"?")) return; await updateDoc(doc(db,"usuarios",u.id),{ativo:n}); flash(`${u.nome} ${n?"habilitado(a)":"desabilitado(a)"}.`); };
  const resetSenha=async(email)=>{ if (!window.confirm("Enviar redefinição para "+email+"?")) return; try { await sendPasswordResetEmail(auth,email); flash(`Link enviado para ${email}.`); } catch { flash("Erro.","erro"); } };
  const professores=usuarios.filter(u=>u.perfil!=="admin"); const admins=usuarios.filter(u=>u.perfil==="admin");
  const td={ padding:"10px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.textMid, fontSize:13 };
  return (
    <div className="fade-in">
      {sucesso&&<div style={{ marginBottom:14 }}><Alert type="success">✅ {sucesso}</Alert></div>}
      {erro&&<div style={{ marginBottom:14 }}><Alert type="error">⚠️ {erro}</Alert></div>}
      <Card style={{ marginBottom:20 }}>
        <p style={{ fontSize:13, fontWeight:800, color:C.navy, marginBottom:14, textTransform:"uppercase" }}>Cadastrar Professor</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:10, alignItems:"end" }}>
          <Field label="Nome" required><input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex: Maria Silva" style={inp} /></Field>
          <Field label="E-mail" required><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="prof@escola.edu.br" style={inp} /></Field>
          <Field label="Senha inicial" required><input type="password" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} placeholder="Mín. 6 caracteres" style={inp} /></Field>
          <Btn onClick={handleCriar} disabled={salvando} variant="navy" style={{ height:42, whiteSpace:"nowrap" }}>{salvando?"...":"+ Cadastrar"}</Btn>
        </div>
        <p style={{ fontSize:11.5, color:C.textMuted, marginTop:10 }}>💡 Informe a senha ao professor. Ele poderá alterá-la via "Esqueci minha senha".</p>
      </Card>
      <Card>
        <p style={{ fontSize:13, fontWeight:800, color:C.navy, marginBottom:14, textTransform:"uppercase" }}>Professores ({professores.length})</p>
        {professores.length===0 ? <p style={{ fontSize:13, color:C.textMuted, textAlign:"center", padding:"24px 0" }}>Nenhum professor cadastrado.</p> : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead><tr style={{ background:C.bg }}>{["Professor","E-mail","Status","Ações"].map(h=><th key={h} style={{ padding:"9px 14px", textAlign:"left", color:C.textMuted, fontWeight:700, borderBottom:`2px solid ${C.border}`, fontSize:11, textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {professores.map((u,i)=>(
                  <tr key={u.id} style={{ background:i%2===0?C.surface:C.bg }}>
                    <td style={td}>{editando?.id===u.id ? <div style={{ display:"flex", gap:6, alignItems:"center" }}><input value={editando.nome} onChange={e=>setEditando({...editando,nome:e.target.value})} style={{ ...inp,padding:"6px 10px",fontSize:12 }} /><Btn onClick={salvarEdicao} disabled={salvando} variant="success" size="sm">Salvar</Btn><Btn onClick={()=>setEditando(null)} variant="ghost" size="sm">✕</Btn></div> : <div style={{ display:"flex", alignItems:"center", gap:8 }}><Avatar nome={u.nome} size={28} /><span style={{ fontWeight:600, color:C.navy }}>{u.nome}</span></div>}</td>
                    <td style={{ ...td, color:C.textMuted, fontFamily:"'DM Mono',monospace", fontSize:12 }}>{u.email}</td>
                    <td style={td}><span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20, background:u.ativo!==false?C.greenBg:C.redBg, color:u.ativo!==false?C.green:C.red }}>{u.ativo!==false?"● Ativo":"○ Inativo"}</span></td>
                    <td style={td}><div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>{editando?.id!==u.id&&<Btn onClick={()=>setEditando({id:u.id,nome:u.nome})} variant="ghost" size="sm">✏️ Editar</Btn>}<Btn onClick={()=>toggleAtivo(u)} variant="ghost" size="sm" style={{ color:u.ativo!==false?C.amber:C.green, borderColor:u.ativo!==false?C.amberBorder:C.greenBorder, background:u.ativo!==false?C.amberBg:C.greenBg }}>{u.ativo!==false?"🔒 Desativar":"🔓 Ativar"}</Btn><Btn onClick={()=>resetSenha(u.email)} variant="ghost" size="sm">🔑 Senha</Btn></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {admins.length>0&&<Card style={{ marginTop:16 }}><p style={{ fontSize:12, fontWeight:700, color:"#6d28d9", marginBottom:10, textTransform:"uppercase" }}>Administradores</p>{admins.map(u=><div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0" }}><Avatar nome={u.nome} variant="purple" size={28} /><span style={{ fontSize:13, fontWeight:600, color:C.navy }}>{u.nome}</span><span style={{ fontSize:12, color:C.textMuted, fontFamily:"'DM Mono',monospace" }}>{u.email}</span></div>)}</Card>}
    </div>
  );
}


// ─── Botão/Modal de Usuários no header ───────────────────────────────────────
function AdminUsuariosBtn() {
  const C = useC();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button onClick={()=>setAberto(true)} className="btn-hover" style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surface, color:C.navy, fontWeight:700, fontSize:12.5, cursor:"pointer" }}>
        👤 Usuários
      </button>
      {aberto&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
          <div className="fade-in" style={{ background:C.surface===undefined?"#fff":C.surface, borderRadius:16, width:"100%", maxWidth:900, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,.3)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 24px", borderBottom:`1px solid ${C.border}` }}>
              <p style={{ fontSize:16, fontWeight:800, color:C.navy }}>👤 Gerenciar Usuários</p>
              <button onClick={()=>setAberto(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.textMuted }}>✕</button>
            </div>
            <div style={{ padding:"20px 24px" }}>
              <GerenciarUsuarios />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AdminView() {
  const C = useC(); const inp = useInp(); const sel = {...inp,cursor:"pointer"};
  const [reservas,setReservas]   = useState([]);
  const [carregando,setCarregando] = useState(true);
  const [usuarios,setUsuarios]   = useState([]);

  // Filtros
  const [filtroEspaco,setFiltroEspaco]   = useState("");
  const [filtroProf,setFiltroProf]       = useState("");
  const [filtroStatus,setFiltroStatus]   = useState("");
  const [filtroTurma,setFiltroTurma]     = useState("");

  // Visualização: "calendario" | "agenda"
  const [modoVisu,setModoVisu] = useState("calendario");

  // Calendário mensal
  const agora2 = new Date();
  const [mesCal,setMesCal] = useState({a:agora2.getFullYear(),m:agora2.getMonth()});
  const [diaSel,setDiaSel] = useState(null);

  // Aba dentro da visão agenda
  const [abaAdmin,setAbaAdmin] = useState("reservas"); // reservas | turma | usuarios
  const [mostrarHistorico,setMostrarHistorico] = useState(false);

  const [editandoReserva,setEditandoReserva] = useState(null);

  useEffect(()=>onSnapshot(collection(db,"reservas"),(snap)=>{
    setReservas(snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r&&r.professor&&r.data&&r.horario));
    setCarregando(false);
  }),[]);

  useEffect(()=>onSnapshot(collection(db,"usuarios"),(snap)=>
    setUsuarios(snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.perfil!=="admin"&&u.ativo!==false).sort((a,b)=>(a.nome||"").localeCompare(b.nome||"")))
  ),[]);

  const hoje  = fmt(today);
  const agora = new Date();

  const pendentes = reservas.filter(r=>r.status==="pendente");
  const isUrgente = r=>{ try { const [h,m]=r.horario.split(":").map(Number); const ev=new Date(r.data+"T00:00:00"); ev.setHours(h,m); return (ev-agora)/3600000<24&&ev>agora&&r.status==="pendente"; } catch { return false; } };
  const urgentes  = pendentes.filter(isUrgente);

  const moderar = (id,acao)=>updateDoc(doc(db,"reservas",id),{status:acao});
  const excluir = async(id)=>{ if(!window.confirm("Excluir permanentemente?")) return; await deleteDoc(doc(db,"reservas",id)); };

  // Reservas filtradas
  const filtradas = reservas.filter(r=>{
    if(filtroEspaco && r.espaco!==filtroEspaco)   return false;
    if(filtroProf   && r.professor!==filtroProf)  return false;
    if(filtroStatus && r.status!==filtroStatus)   return false;
    if(filtroTurma  && r.turma!==filtroTurma)     return false;
    return true;
  });

  // Turmas únicas presentes nas reservas
  const turmasPresentes = [...new Set(reservas.map(r=>r.turma))].filter(Boolean).sort();
  const turmasMap={};
  filtradas.forEach(r=>{ if(!turmasMap[r.turma])turmasMap[r.turma]=[]; turmasMap[r.turma].push(r); });

  const kpis=[
    {label:"Total",       val:reservas.length,                                    bg:"#e2f0eb", c:C.blueMid},
    {label:"Confirmados", val:reservas.filter(r=>r.status==="confirmado").length, bg:C.greenBg, c:C.green},
    {label:"Pendentes",   val:pendentes.length,                                   bg:C.amberBg, c:C.amber},
    {label:"Urgentes",    val:urgentes.length,                                    bg:"#fff7ed",  c:"#c2410c"},
  ];

  // ── Calendário mensal ──
  const nomeMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mesCal.m];
  const primeiroDia = new Date(Date.UTC(mesCal.a,mesCal.m,1));
  const diasNoMes   = new Date(Date.UTC(mesCal.a,mesCal.m+1,0)).getUTCDate();
  const inicioGrid  = primeiroDia.getUTCDay();
  const cells=[]; for(let i=0;i<inicioGrid;i++)cells.push(null); for(let d=1;d<=diasNoMes;d++)cells.push(d);
  const navMes=(dir)=>{ setMesCal(({a,m})=>{ let nm=m+dir,na=a; if(nm>11){nm=0;na++;} if(nm<0){nm=11;na--;} return {a:na,m:nm}; }); setDiaSel(null); };

  // Reservas filtradas agrupadas por data (para calendário)
  const porDataCal = useMemo(()=>{
    const m={};
    filtradas.filter(r=>r.status!=="recusado").forEach(r=>{ if(!m[r.data])m[r.data]=[]; m[r.data].push(r); });
    return m;
  },[filtradas]);

  // Linha de reserva
  const ReservaRow=({r,showDate=false})=>{
    const urg=isUrgente(r);
    const borderColor=r.status==="confirmado"?"#1a6b47":r.status==="pendente"?"#d97706":"#dc2626";
    const [ano,mes,dia]=r.data.split("-");
    return (
      <div className="row-hover" style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, marginBottom:6, background:urg?"#fff7ed":r.data===hoje?"rgba(26,107,71,.05)":C.surface, border:`1px solid ${urg?"#f97316":r.data===hoje?"#40b07a44":C.border}`, borderLeft:`4px solid ${urg?"#f97316":borderColor}` }}>
        <div style={{ minWidth:52, flexShrink:0, textAlign:"center" }}>
          <p style={{ fontSize:13, fontFamily:"'DM Mono',monospace", fontWeight:800, color:urg?"#c2410c":C.blueMid }}>{r.horario}</p>
          {showDate&&<p style={{ fontSize:10, color:C.textMuted, marginTop:1 }}>{dia}/{mes}</p>}
        </div>
        <div style={{ width:1, height:38, background:C.borderLight, flexShrink:0 }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
            <span style={{ fontWeight:700, fontSize:13, color:C.navy }}>{r.espaco}</span>
            <span style={{ fontSize:11, color:C.textMuted }}>·</span>
            <span style={{ fontSize:12.5, color:C.textMid, fontWeight:600 }}>{r.professor}</span>
            <span style={{ fontSize:11, color:C.textMuted }}>·</span>
            <span style={{ fontSize:12, color:C.textMuted }}>{r.turma}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
            <Badge status={r.status} />
            {urg&&<span style={{ fontSize:10.5, fontWeight:800, background:"#fff7ed", color:"#c2410c", border:"1.5px solid #f97316", padding:"1px 8px", borderRadius:10 }}>⚡ URGENTE</span>}
            {r.conteudo&&<span style={{ fontSize:11.5, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:200 }}>{r.conteudo}</span>}
            {r.quantidade&&<span style={{ fontSize:11, color:C.textMuted, background:C.bg, padding:"1px 7px", borderRadius:10, border:`1px solid ${C.border}` }}>🖥️ {r.quantidade} un.</span>}
            {r.laboratorista==="Sim"&&<span style={{ fontSize:11, color:C.textMuted, background:C.bg, padding:"1px 7px", borderRadius:10, border:`1px solid ${C.border}` }}>🔬 Lab</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:5, flexShrink:0, alignItems:"center" }}>
          <button onClick={()=>setEditandoReserva(r)} title="Editar agendamento" style={{ background:"none", border:"1px solid transparent", borderRadius:7, color:C.textMuted, cursor:"pointer", fontSize:14, padding:"5px 8px", display:"flex", alignItems:"center", gap:4, transition:"all .15s" }}
            onMouseEnter={e=>{e.currentTarget.style.background=C.greenBg;e.currentTarget.style.borderColor=C.greenBorder;e.currentTarget.style.color=C.green;}}
            onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.borderColor="transparent";e.currentTarget.style.color=C.textMuted;}}>
            ✏️ <span style={{ fontSize:11, fontWeight:600 }}>Editar</span>
          </button>
          {r.status==="pendente"&&<><Btn onClick={()=>moderar(r.id,"confirmado")} variant="success" size="sm">✓ Aprovar</Btn><Btn onClick={()=>moderar(r.id,"recusado")} variant="danger" size="sm">✗</Btn></>}
          {r.status==="confirmado"&&(
            <button onClick={()=>moderar(r.id,"recusado")} title="Cancelar reserva" style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:7, color:C.red, cursor:"pointer", fontSize:11, fontWeight:600, padding:"5px 10px", display:"flex", alignItems:"center", gap:4, transition:"all .15s" }}
              onMouseEnter={e=>{e.currentTarget.style.opacity=".8";}}
              onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
              ✕ Cancelar
            </button>
          )}
          <button onClick={()=>excluir(r.id)} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:14, padding:"4px" }}>🗑</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth:1040, margin:"0 auto", padding:"24px 16px" }}>
      {editandoReserva&&<ModalEdicao reserva={editandoReserva} isAdmin onClose={()=>setEditandoReserva(null)} onSave={()=>setEditandoReserva(null)} />}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:C.navy }}>Painel Administrativo</h1>
          <p style={{ fontSize:13, color:C.textMuted, marginTop:3 }}>
            {carregando?"Carregando...":`${reservas.length} reserva${reservas.length!==1?"s":""} · ${usuarios.length} professor${usuarios.length!==1?"es":""} ativos`}
          </p>
        </div>
        {/* Toggle Calendário / Agenda — no header */}
        <div style={{ display:"flex", background:C.surface, borderRadius:10, padding:3, border:`1px solid ${C.border}`, gap:2, alignSelf:"center" }}>
          {[{id:"calendario",label:"📅 Calendário"},{id:"agenda",label:"☰ Agenda"}].map(op=>(
            <button key={op.id} onClick={()=>setModoVisu(op.id)} style={{ padding:"7px 20px", borderRadius:8, border:"none", background:modoVisu===op.id?C.navy:"transparent", color:modoVisu===op.id?"#fff":C.textMuted, fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .15s" }}>{op.label}</button>
          ))}
        </div>
      </div>

      {/* Banner urgentes */}
      {urgentes.length>0&&(
        <div style={{ background:"linear-gradient(135deg,#f97316,#ea580c)", borderRadius:14, padding:"14px 18px", marginBottom:18, display:"flex", alignItems:"center", gap:14, boxShadow:"0 4px 16px rgba(249,115,22,.3)" }}>
          <div style={{ width:44,height:44,borderRadius:12,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>⚡</div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:14, fontWeight:800, color:"#fff", margin:0 }}>{urgentes.length} agendamento{urgentes.length!==1?"s":""} urgente{urgentes.length!==1?"s":""} aguardando aprovação</p>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.8)", margin:"3px 0 0" }}>Menos de 24h para o horário — precisam de confirmação imediata</p>
          </div>
          <button onClick={()=>{ setModoVisu("agenda"); setAbaAdmin("reservas"); setFiltroStatus("pendente"); }} style={{ background:"rgba(255,255,255,.2)", border:"2px solid rgba(255,255,255,.4)", borderRadius:10, color:"#fff", fontWeight:800, fontSize:13, padding:"8px 16px", cursor:"pointer", whiteSpace:"nowrap" }}>
            Ver urgentes →
          </button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:20 }}>
        {kpis.map(k=>(
          <div key={k.label} className="kpi-hover" style={{ background:k.bg, borderRadius:12, padding:"14px 16px" }}>
            <p style={{ fontSize:10, fontWeight:700, color:k.c, textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>{k.label}</p>
            {carregando ? <div style={{ width:40,height:28,borderRadius:6,background:`${k.c}22`,animation:"pulse 1.5s infinite" }} /> : <p style={{ fontSize:30, fontWeight:800, color:k.c, lineHeight:1 }}>{k.val}</p>}
          </div>
        ))}
      </div>

      {/* ── FILTROS (sempre visíveis) ── */}
      <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, padding:"12px 16px", marginBottom:20 }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:".4px", whiteSpace:"nowrap" }}>Filtrar:</span>

          <select value={filtroEspaco} onChange={e=>setFiltroEspaco(e.target.value)} style={{ ...sel, width:"auto", fontSize:12.5, padding:"6px 10px", flex:1, minWidth:150 }}>
            <option value="">🏛️ Todos os espaços</option>
            <optgroup label="Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            <optgroup label="Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            <optgroup label="Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
          </select>

          <select value={filtroProf} onChange={e=>setFiltroProf(e.target.value)} style={{ ...sel, width:"auto", fontSize:12.5, padding:"6px 10px", flex:1, minWidth:150 }}>
            <option value="">👤 Todos os professores</option>
            {usuarios.map(u=><option key={u.id} value={u.nome}>{u.nome}</option>)}
          </select>

          <select value={filtroTurma} onChange={e=>setFiltroTurma(e.target.value)} style={{ ...sel, width:"auto", fontSize:12.5, padding:"6px 10px", flex:1, minWidth:130 }}>
            <option value="">🎓 Todas as turmas</option>
            <optgroup label="Anos Iniciais">{turmasPresentes.filter(t=>parseInt(t)<=5).map(t=><option key={t} value={t}>{t}</option>)}</optgroup>
            <optgroup label="Anos Finais">{turmasPresentes.filter(t=>parseInt(t)>=6).map(t=><option key={t} value={t}>{t}</option>)}</optgroup>
          </select>

          <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)} style={{ ...sel, width:"auto", fontSize:12.5, padding:"6px 10px", flex:"0 0 auto", minWidth:130 }}>
            <option value="">● Todos os status</option>
            <option value="confirmado">✅ Confirmado</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="recusado">❌ Recusado</option>
          </select>

          {(filtroEspaco||filtroProf||filtroStatus||filtroTurma)&&(
            <button onClick={()=>{setFiltroEspaco("");setFiltroProf("");setFiltroStatus("");setFiltroTurma("");}} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, color:C.textMuted, fontSize:12, padding:"6px 12px", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>✕ Limpar</button>
          )}
          {(filtroEspaco||filtroProf||filtroStatus||filtroTurma)&&(
            <span style={{ fontSize:11.5, color:C.textMuted, whiteSpace:"nowrap" }}>{filtradas.length} resultado{filtradas.length!==1?"s":""}</span>
          )}
          <button onClick={()=>setMostrarHistorico(h=>!h)} style={{ background:mostrarHistorico?C.navy:"transparent", border:`1.5px solid ${mostrarHistorico?C.navy:C.border}`, borderRadius:8, color:mostrarHistorico?"#fff":C.textMuted, fontSize:12, padding:"6px 12px", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5, marginLeft:"auto" }}>
            🕐 {mostrarHistorico?"Ocultar histórico":"Ver histórico"}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MODO CALENDÁRIO (default)
      ══════════════════════════════════════════════ */}
      {modoVisu==="calendario"&&(
        <div className="fade-in">
          {/* Cabeçalho do mês */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={()=>navMes(-1)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.textMid, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <div style={{ textAlign:"center", minWidth:130 }}>
                <p style={{ fontSize:18, fontWeight:800, color:C.navy }}>{nomeMes} {mesCal.a}</p>
                <p style={{ fontSize:11, color:C.textMuted }}>{filtradas.filter(r=>r.status!=="recusado"&&r.data.startsWith(`${mesCal.a}-${String(mesCal.m+1).padStart(2,"0")}`)).length} agendamentos neste mês</p>
              </div>
              <button onClick={()=>navMes(1)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.textMid, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
            <button onClick={()=>{ const d=new Date(); setMesCal({a:d.getFullYear(),m:d.getMonth()}); setDiaSel(null); }} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:8, color:C.blueMid, fontSize:12, fontWeight:700, padding:"6px 14px", cursor:"pointer" }}>Hoje</button>
          </div>

          <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:C.cardShadow }}>
            {/* Dias da semana */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`2px solid ${C.border}` }}>
              {["Dom.","Seg.","Ter.","Qua.","Qui.","Sexta","Sáb."].map((d,i)=>(
                <div key={d} style={{ padding:"10px 0", textAlign:"center", fontSize:11, fontWeight:700, color:i===0||i===6?"#ef4444":C.textMuted, letterSpacing:".3px", textTransform:"uppercase" }}>{d}</div>
              ))}
            </div>
            {/* Células */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
              {cells.map((d,i)=>{
                if (!d) return <div key={i} style={{ minHeight:90, borderRight:`1px solid ${C.borderLight}`, borderBottom:`1px solid ${C.borderLight}` }} />;
                const dateStr=`${mesCal.a}-${String(mesCal.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const isPast=dateStr<hoje, isHoje=dateStr===hoje, isSel=dateStr===diaSel;
                const rsdia=porDataCal[dateStr]||[];
                const urgDia=rsdia.filter(isUrgente);
                const pendDia=rsdia.filter(r=>r.status==="pendente"&&!isUrgente(r));
                const confDia=rsdia.filter(r=>r.status==="confirmado");
                const dow=new Date(Date.UTC(mesCal.a,mesCal.m,d)).getUTCDay();
                const isFimSemana=dow===0||dow===6;
                const naoLetivoAdmin=!isDiaLetivo(dateStr)&&!isPast&&!isFimSemana;
                return (
                  <div key={i} onClick={()=>setDiaSel(isSel?null:dateStr)} style={{ minHeight:90, borderRight:`1px solid ${C.borderLight}`, borderBottom:`1px solid ${C.borderLight}`, padding:"6px 8px", cursor:"pointer", background:isSel?"rgba(26,107,71,.08)":isHoje?"rgba(26,107,71,.04)":naoLetivoAdmin?"rgba(239,68,68,.04)":isPast?"rgba(0,0,0,.015)":"transparent", transition:"background .15s", position:"relative" }}>
                    {/* Número do dia */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:13.5, fontWeight:isHoje?900:500, color:isSel?"#40b07a":isHoje?"#40b07a":isPast?C.textMuted:naoLetivoAdmin?"#ef4444":isFimSemana?"#ef4444":C.navy, width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:isHoje?"rgba(26,107,71,.15)":naoLetivoAdmin?"rgba(239,68,68,.12)":"transparent" }}>{d}</span>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
                        {naoLetivoAdmin&&<span style={{ fontSize:8, fontWeight:700, color:"#ef4444", background:"rgba(239,68,68,.1)", borderRadius:4, padding:"1px 4px", lineHeight:1.2 }}>não letivo</span>}
                        {rsdia.length>0&&<span style={{ fontSize:10, fontWeight:700, color:urgDia.length>0?"#c2410c":pendDia.length>0?C.amber:C.green, background:urgDia.length>0?"#fff7ed":pendDia.length>0?C.amberBg:C.greenBg, borderRadius:8, padding:"1px 5px" }}>{rsdia.length}</span>}
                      </div>
                    </div>
                    {/* Chips de reservas */}
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      {urgDia.slice(0,2).map(r=>(
                        <div key={r.id} style={{ background:"#fff7ed", border:"1px solid #f97316", borderRadius:4, padding:"2px 5px", fontSize:9.5, fontWeight:700, color:"#c2410c", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          ⚡ {r.horario} {r.professor.split(" ")[0]}
                        </div>
                      ))}
                      {pendDia.slice(0,1).map(r=>(
                        <div key={r.id} title={`⏳ ${r.horario} | ${r.espaco} | ${r.professor}`} style={{ background:C.amberBg, border:`1px solid ${C.amberBorder}`, borderRadius:4, padding:"2px 5px", fontSize:9.5, fontWeight:700, color:C.amber, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", cursor:"pointer" }} onClick={(e)=>{e.stopPropagation();setDiaSel(dateStr);}}>
                          ⏳ {r.horario} {r.espaco.split(" ")[0]}
                        </div>
                      ))}
                      {confDia.slice(0,2).map(r=>(
                        <div key={r.id} title={`✅ ${r.horario} | ${r.espaco} | ${r.professor} | ${r.turma}`} style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:4, padding:"2px 5px", fontSize:9.5, fontWeight:600, color:C.green, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", cursor:"pointer" }} onClick={(e)=>{e.stopPropagation();setDiaSel(dateStr);}}>
                          {r.horario} {r.espaco.split(" ")[0]}
                        </div>
                      ))}
                      {rsdia.length>3&&<div title={rsdia.slice(3).map(r=>`${r.horario} | ${r.espaco} | ${r.professor.split(" ")[0]}`).join("\n")} style={{ fontSize:9, color:C.blueMid, fontWeight:700, paddingLeft:2, cursor:"pointer" }} onClick={(e)=>{e.stopPropagation();setDiaSel(dateStr);}}>+{rsdia.length-3} mais ↓</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legenda */}
          <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap", alignItems:"center" }}>
            {[{label:"Urgente",bg:"#fff7ed",border:"#f97316",c:"#c2410c"},{label:"Pendente",bg:C.amberBg,border:C.amberBorder,c:C.amber},{label:"Confirmado",bg:C.greenBg,border:C.greenBorder,c:C.green}].map(l=>(
              <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:14, height:14, borderRadius:3, background:l.bg, border:`1.5px solid ${l.border}` }} />
                <span style={{ fontSize:11.5, color:C.textMuted, fontWeight:600 }}>{l.label}</span>
              </div>
            ))}
            <span style={{ marginLeft:"auto", fontSize:11, color:C.textMuted }}>Clique no dia para ver detalhes</span>
          </div>

          {/* Painel lateral do dia selecionado */}
          {diaSel&&(
            <div className="fade-in" style={{ marginTop:16, background:C.surface, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:C.cardShadow }}>
              <div style={{ background:`linear-gradient(135deg,#1a6b47,#0f4c2b)`, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,.75)", fontWeight:700, textTransform:"uppercase", letterSpacing:".5px" }}>Agendamentos do dia</p>
                  <p style={{ fontSize:16, fontWeight:800, color:"#fff", marginTop:2 }}>📅 {diaSel.split("-").reverse().join("/")}</p>
                </div>
                <button onClick={()=>setDiaSel(null)} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:700, padding:"5px 12px", cursor:"pointer" }}>✕ Fechar</button>
              </div>
              <div style={{ padding:"14px 18px" }}>
                {(porDataCal[diaSel]||[]).length===0 ? (
                  <p style={{ fontSize:13, color:C.textMuted, textAlign:"center", padding:"16px 0" }}>🎉 Nenhum agendamento neste dia.</p>
                ) : (
                  [...(porDataCal[diaSel]||[])].sort((a,b)=>a.horario>b.horario?1:-1).map(r=><ReservaRow key={r.id} r={r} />)
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODO AGENDA (lista)
      ══════════════════════════════════════════════ */}
      {modoVisu==="agenda"&&(
        <div className="fade-in">
          {/* Sub-abas */}
          <div style={{ display:"flex", gap:2, marginBottom:18, background:C.surface, borderRadius:10, padding:4, border:`1px solid ${C.border}`, width:"fit-content" }}>
            {[{id:"reservas",label:"📋 Reservas"},{id:"espacos",label:"🏛️ Por Espaço"},{id:"turma",label:"🎓 Por Turma"}].map(t=>(
              <button key={t.id} onClick={()=>setAbaAdmin(t.id)} style={{ padding:"7px 15px", borderRadius:7, border:"none", background:abaAdmin===t.id?C.navy:"transparent", color:abaAdmin===t.id?"#fff":C.textMuted, fontSize:12.5, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", transition:"all .15s" }}>{t.label}</button>
            ))}
          </div>

          {/* Sub-aba: Reservas */}
          {abaAdmin==="reservas"&&(
            <div>
              {urgentes.length>0&&!(filtroStatus&&filtroStatus!=="pendente")&&(
                <div style={{ marginBottom:18 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <div style={{ width:8,height:8,borderRadius:"50%",background:"#f97316",animation:"pulse 1.5s infinite" }} />
                    <p style={{ fontSize:12, fontWeight:800, color:"#c2410c", textTransform:"uppercase", letterSpacing:".5px" }}>⚡ Urgentes · {urgentes.length}</p>
                    <div style={{ flex:1, height:1, background:"#fed7aa" }} />
                  </div>
                  {urgentes.sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1).map(r=><ReservaRow key={r.id} r={r} showDate />)}
                </div>
              )}
              {(()=>{
                const pendNaoUrg=filtradas.filter(r=>r.status==="pendente"&&!isUrgente(r));
                if(!pendNaoUrg.length) return null;
                return (
                  <div style={{ marginBottom:18 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:"#d97706" }} />
                      <p style={{ fontSize:12, fontWeight:800, color:C.amber, textTransform:"uppercase", letterSpacing:".5px" }}>Pendentes · {pendNaoUrg.length}</p>
                      <div style={{ flex:1, height:1, background:C.amberBorder }} />
                    </div>
                    {pendNaoUrg.sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1).map(r=><ReservaRow key={r.id} r={r} showDate />)}
                  </div>
                );
              })()}
              {(()=>{
                const confTodas=filtradas.filter(r=>r.status!=="pendente");
                const conf=mostrarHistorico?confTodas:confTodas.filter(r=>r.data>=hoje);
                const confPassadas=confTodas.filter(r=>r.data<hoje);
                if(!conf.length&&!confPassadas.length) { if(!filtradas.filter(r=>r.status==="pendente").length) return <p style={{ textAlign:"center",padding:"32px",color:C.textMuted,fontSize:13 }}>Nenhuma reserva encontrada.</p>; return null; }
                const ord=[...conf].sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1);
                const pd={}; ord.forEach(r=>{ if(!pd[r.data])pd[r.data]=[]; pd[r.data].push(r); });
                return (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:C.green }} />
                      <p style={{ fontSize:12, fontWeight:800, color:C.green, textTransform:"uppercase", letterSpacing:".5px" }}>Confirmados · {conf.length}</p>
                      <div style={{ flex:1, height:1, background:C.greenBorder }} />
                      {!mostrarHistorico&&confPassadas.length>0&&<span style={{ fontSize:11, color:C.textMuted, whiteSpace:"nowrap" }}>+{confPassadas.length} no histórico</span>}
                    </div>
                    {Object.entries(pd).map(([data,rs])=>{
                      const [ano,mes,dia]=data.split("-"); const isH=data===hoje; const isFut=data>=hoje;
                      return (
                        <div key={data} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <div style={{ background:isH?"#40b07a":isFut?C.navy:C.textMuted, color:"#fff", borderRadius:7, padding:"3px 12px", fontSize:11.5, fontWeight:700, fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>{isH?"📌 Hoje":`${dia}/${mes}/${ano}`}</div>
                            <div style={{ flex:1, height:1, background:C.borderLight }} />
                            <span style={{ fontSize:11, color:C.textMuted }}>{rs.length} reserva{rs.length!==1?"s":""}</span>
                          </div>
                          {rs.map(r=><ReservaRow key={r.id} r={r} />)}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sub-aba: Por Espaço */}
          {abaAdmin==="espacos"&&(
            <div>
              {ESPACOS.filter(esp=>!filtroEspaco||esp.nome===filtroEspaco).map(esp=>{
                const rs=filtradas.filter(r=>r.espaco===esp.nome&&r.status!=="recusado").sort((a,b)=>a.data>b.data?1:a.data<b.data?-1:a.horario>b.horario?1:-1);
                if(!rs.length) return null;
                const pd={}; rs.forEach(r=>{ if(!pd[r.data])pd[r.data]=[]; pd[r.data].push(r); });
                const livresHoje=HORARIOS.length-rs.filter(r=>r.data===hoje).length;
                return (
                  <div key={esp.id} style={{ marginBottom:16, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                    <div style={{ background:`linear-gradient(135deg,${C.navy},${C.navyMid})`, padding:"12px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:18 }}>{tipoIcon(esp.tipo)}</span>
                        <div><p style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{esp.nome}</p><p style={{ fontSize:11, color:"rgba(255,255,255,.65)" }}>{rs.length} reserva{rs.length!==1?"s":""}</p></div>
                      </div>
                      <div style={{ textAlign:"right" }}><p style={{ fontSize:20, fontWeight:900, color:"#fff", lineHeight:1 }}>{livresHoje}</p><p style={{ fontSize:10, color:"rgba(255,255,255,.7)", fontWeight:700 }}>livres hoje</p></div>
                    </div>
                    <div style={{ background:C.surface, padding:"10px 16px" }}>
                      {Object.entries(pd).map(([data,drs])=>{
                        const [ano,mes,dia]=data.split("-"); const isH=data===hoje;
                        return (
                          <div key={data} style={{ marginBottom:10 }}>
                            <p style={{ fontSize:11, fontWeight:700, color:isH?"#40b07a":C.textMuted, fontFamily:"'DM Mono',monospace", marginBottom:6 }}>{isH?"📌 Hoje":`${dia}/${mes}/${ano}`}</p>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                              {drs.map(r=>(
                                <div key={r.id} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 12px", fontSize:12, display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontWeight:800, color:C.blueMid, fontFamily:"'DM Mono',monospace" }}>{r.horario}</span>
                                  <span style={{ color:C.textMid, fontWeight:600 }}>{r.professor.split(" ")[0]}</span>
                                  <span style={{ color:C.textMuted }}>{r.turma}</span>
                                  <Badge status={r.status} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sub-aba: Por Turma */}
          {abaAdmin==="turma"&&(
            <div>
              {Object.keys(turmasMap).length===0&&<p style={{ textAlign:"center",padding:"32px",color:C.textMuted,fontSize:13 }}>Nenhuma reserva encontrada.</p>}
              {Object.entries(turmasMap).sort(([a],[b])=>a.localeCompare(b)).map(([turma,rs])=>(
                <Card key={turma} style={{ marginBottom:14, padding:0, overflow:"hidden" }}>
                  <div style={{ background:C.navy, color:"#fff", padding:"10px 16px", display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>{turma}</span>
                    <span style={{ opacity:.6, fontSize:12 }}>{rs.length} agendamento{rs.length!==1?"s":""}</span>
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead><tr style={{ background:C.bg }}>{["Data","Horário","Espaço","Professor","Conteúdo","Status"].map(h=><th key={h} style={{ padding:"8px 14px", textAlign:"left", color:C.textMuted, fontWeight:700, borderBottom:`1px solid ${C.border}`, fontSize:11, textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {[...rs].sort((a,b)=>a.data>b.data?1:-1).map((r,i)=>(
                        <tr key={r.id} style={{ background:i%2===0?C.surface:C.bg }}>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.textMid, fontFamily:"'DM Mono',monospace" }}>{r.data.split("-").reverse().join("/")}</td>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.blueMid, fontFamily:"'DM Mono',monospace", fontWeight:700 }}>{r.horario}</td>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.textMid }}>{r.espaco}</td>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.textMid, fontWeight:600 }}>{r.professor}</td>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}`, color:C.textMuted, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.conteudo}</td>
                          <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.borderLight}` }}><Badge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
          )}


        </div>
      )}
    </div>
  );
}
function ModalLogin({ onSuccess, onClose }) {
  const C = useC(); const inp = useInp();
  const [email,setEmail] = useState(""); const [senha,setSenha] = useState(""); const [erro,setErro] = useState(""); const [loading,setLoading] = useState(false);
  const handleLogin=async()=>{ if (!email||!senha) return setErro("Preencha e-mail e senha."); setLoading(true); setErro(""); try { await signInWithEmailAndPassword(auth,email,senha); onSuccess(); } catch { setErro("E-mail ou senha incorretos."); } finally { setLoading(false); } };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
      <div className="fade-in" style={{ background:C.surface, borderRadius:20, padding:"36px 32px", width:"100%", maxWidth:400, boxShadow:"0 32px 80px rgba(0,0,0,.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}><Logo size={36} /><div><p style={{ fontSize:14, fontWeight:800, color:C.navy }}>Entrar</p><p style={{ fontSize:11, color:C.textMuted }}>Colégio Arena</p></div></div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.textMuted }}>✕</button>
        </div>
        {erro&&<div style={{ marginBottom:14 }}><Alert type="error">{erro}</Alert></div>}
        <div style={{ display:"grid", gap:13 }}>
          <Field label="E-mail"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@escola.edu.br" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()} /></Field>
          <Field label="Senha"><input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••" style={inp} onKeyDown={e=>e.key==="Enter"&&handleLogin()} /></Field>
          <button onClick={handleLogin} disabled={loading} style={{ padding:"11px", borderRadius:10, border:"none", background:"#40b07a", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}>{loading?"Aguarde...":"Entrar →"}</button>
        </div>
        <p style={{ fontSize:11, color:C.textMuted, textAlign:"center", marginTop:16 }}>Sem acesso? Contate o administrador.</p>
      </div>
    </div>
  );
}

function TelaPublica() {
  const C = useC(); const { toggle, dark } = useTheme();
  const hoje = fmt(today);
  const [espacoSel,setEspacoSel] = useState(""); const [modoVisu,setModoVisu] = useState("semana"); const [diaMesSel,setDiaMesSel] = useState(null); const [mostrarLogin,setMostrarLogin] = useState(false);
  const inpStyle = { padding:"10px 12px", borderRadius:8, fontSize:13.5, border:`1.5px solid ${C.inputBorder}`, background:C.inputBg, color:C.text, outline:"none", width:"100%", cursor:"pointer" };
  const [todasReservas,setTodasReservas] = useState([]);
  useEffect(()=>onSnapshot(collection(db,"reservas"),snap=>setTodasReservas(snap.docs.map(d=>d.data()).filter(r=>r&&r.professor&&r.data&&r.horario))),[]);
  const fonte=useMemo(()=>todasReservas.filter(r=>r?.status!=="recusado"&&(!espacoSel||r.espaco===espacoSel)),[todasReservas,espacoSel]);
  const reservasPorData=useMemo(()=>{ const m={}; fonte.forEach(r=>{ if(!m[r.data])m[r.data]=[]; m[r.data].push(r); }); return m; },[fonte]);
  const seg=getSegunda(hoje); const diasSemana=Array.from({length:5},(_,i)=>addDays(seg,i)); const nomesDia=["Seg.","Ter.","Qua.","Qui.","Sexta"];
  const agora2=new Date(); const [mesCal,setMesCal]=useState({a:agora2.getFullYear(),m:agora2.getMonth()});
  const nomeMes=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mesCal.m];
  const primeiroDia=new Date(Date.UTC(mesCal.a,mesCal.m,1)); const diasNoMes=new Date(Date.UTC(mesCal.a,mesCal.m+1,0)).getUTCDate(); const inicioGrid=primeiroDia.getUTCDay();
  const cells=[]; for(let i=0;i<inicioGrid;i++)cells.push(null); for(let d=1;d<=diasNoMes;d++)cells.push(d);
  const navMes=(dir)=>setMesCal(({a,m})=>{ let nm=m+dir,na=a; if(nm>11){nm=0;na++;} if(nm<0){nm=11;na--;} return {a:na,m:nm}; });
  return (
    <div style={{ minHeight:"100vh", background:C.bg }} translate="no" lang="pt-BR">
      {mostrarLogin&&<ModalLogin onSuccess={()=>setMostrarLogin(false)} onClose={()=>setMostrarLogin(false)} />}
      <header style={{ background:C.headerBg, borderBottom:C.headerBorder, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 6px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}><Logo size={34} /><div><p style={{ fontSize:13, fontWeight:800, color:C.navy }}>Reserva de Salas</p><p style={{ fontSize:10, color:C.textMuted }}>Colégio Arena</p></div></div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={toggle} style={{ background:dark?"#f1f5f9":"#0f172a", color:dark?"#0f172a":"#f1f5f9", border:"none", borderRadius:20, padding:"5px 12px", cursor:"pointer", fontSize:12, fontWeight:700 }}>{dark?"☀️ Claro":"🌙 Escuro"}</button>
          <button onClick={()=>setMostrarLogin(true)} style={{ padding:"7px 18px", borderRadius:8, border:"none", background:"#40b07a", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>Entrar</button>
        </div>
      </header>
      <div style={{ maxWidth:700, margin:"0 auto", padding:"20px 16px 60px" }}>
        <div style={{ background:`linear-gradient(135deg,#1a6b47,#0f4c2b)`, borderRadius:14, padding:"18px 20px", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <div><p style={{ fontSize:15, fontWeight:800, color:"#fff", marginBottom:4 }}>Bem-vindo ao sistema de reservas</p><p style={{ fontSize:12.5, color:"rgba(255,255,255,.8)" }}>Para agendar, entre com seu login de professor.</p></div>
          <button onClick={()=>setMostrarLogin(true)} style={{ padding:"10px 22px", borderRadius:10, border:"2px solid #fff", background:"transparent", color:"#fff", fontWeight:800, fontSize:13.5, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>Entrar para agendar →</button>
        </div>
        <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", justifyContent:"space-between" }}>
          <select value={espacoSel} onChange={e=>{ setEspacoSel(e.target.value); setDiaMesSel(null); }} style={{ ...inpStyle, maxWidth:280 }}>
            <option value="">Todos os espaços</option>
            <optgroup label="🏛️ Espaços">{ESPACOS.filter(e=>e.tipo==="espaco").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            <optgroup label="🔬 Laboratórios">{ESPACOS.filter(e=>e.tipo==="laboratorio").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
            <optgroup label="💻 Equipamentos">{ESPACOS.filter(e=>e.tipo==="equipamento").map(e=><option key={e.id} value={e.nome}>{e.nome}</option>)}</optgroup>
          </select>
          <div style={{ display:"flex", background:C.bg, borderRadius:8, padding:2, border:`1px solid ${C.border}` }}>
            {[{id:"semana",label:"Semana"},{id:"mes",label:"Mês"}].map(op=><button key={op.id} onClick={()=>setModoVisu(op.id)} style={{ padding:"6px 14px", borderRadius:6, border:"none", background:modoVisu===op.id?C.navy:"transparent", color:modoVisu===op.id?"#fff":C.textMuted, fontWeight:700, fontSize:12.5, cursor:"pointer" }}>{op.label}</button>)}
          </div>
        </div>
        {modoVisu==="semana"&&(
          <div style={{ background:`linear-gradient(135deg,#1a6b47,#0f4c2b)`, borderRadius:14, padding:"16px 18px", color:"#fff" }}>
            <p style={{ fontSize:11, fontWeight:700, opacity:.75, textTransform:"uppercase", letterSpacing:".5px", marginBottom:12 }}>Semana atual</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
              {diasSemana.map((d,i)=>{ const [,,dia]=d.split("-"); const isHoje=d===hoje; const rsDodia=fonte.filter(r=>r.data===d).sort((a,b)=>a.horario>b.horario?1:-1); return (
                <div key={d} style={{ background:isHoje?"rgba(255,255,255,.22)":"rgba(255,255,255,.1)", borderRadius:10, padding:"8px 6px", minHeight:80 }}>
                  <div style={{ textAlign:"center", marginBottom:6 }}><p style={{ fontSize:9.5, fontWeight:700, opacity:.75, textTransform:"uppercase" }}>{nomesDia[i]}</p><p style={{ fontSize:16, fontWeight:900, lineHeight:1 }}>{dia}</p>{isHoje&&<div style={{ width:4, height:4, borderRadius:"50%", background:"#fff", margin:"3px auto 0" }} />}</div>
                  {rsDodia.length===0 ? <p style={{ fontSize:9, opacity:.4, textAlign:"center" }}>—</p> : <div style={{ display:"grid", gap:3 }}>{rsDodia.map((r,ri)=><div key={r.id||ri} style={{ background:"rgba(255,255,255,.18)", borderRadius:5, padding:"3px 5px" }}><p style={{ fontSize:9.5, fontWeight:800, fontFamily:"'DM Mono',monospace", opacity:.95 }}>{r.horario}</p><p style={{ fontSize:9, fontWeight:700, opacity:.9, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{espacoSel?r.professor.split(" ")[0]:r.espaco.split(" ")[0]}</p><p style={{ fontSize:8.5, opacity:.7 }}>{r.turma}</p></div>)}</div>}
                </div>
              ); })}
            </div>
          </div>
        )}
        {modoVisu==="mes"&&(
          <div style={{ background:C.surface, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:`1px solid ${C.border}` }}>
              <button onClick={()=>navMes(-1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <div style={{ textAlign:"center" }}><p style={{ fontSize:16, fontWeight:800, color:C.navy }}>{nomeMes}</p><p style={{ fontSize:12, color:C.textMuted }}>{mesCal.a}</p></div>
              <button onClick={()=>navMes(1)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.textMid, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
            <div style={{ padding:"12px 16px 16px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>{["D","S","T","Q","Q","S","S"].map((n,i)=><div key={i} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:i===0||i===6?"#ef4444":C.textMuted, padding:"3px 0" }}>{n}</div>)}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                {cells.map((d,i)=>{ if (!d) return <div key={i} />; const dateStr=`${mesCal.a}-${String(mesCal.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; const isHoje=dateStr===hoje; const isPast=dateStr<hoje; const isSel=dateStr===diaMesSel; const rs=reservasPorData[dateStr]||[]; const profs=[...new Map(rs.map(r=>[r.professorId,r])).values()]; return (
                  <button key={i} onClick={()=>setDiaMesSel(isSel?null:dateStr)} style={{ borderRadius:8, border:"none", cursor:"pointer", background:isSel?"#40b07a":isHoje?"rgba(26,107,71,.12)":"transparent", transition:"all .15s", display:"flex", flexDirection:"column", alignItems:"center", padding:"5px 2px", gap:2, minHeight:52 }}>
                    <span style={{ fontWeight:isHoje||isSel?900:500, fontSize:13, color:isSel?"#fff":isPast?C.textMuted:C.navy }}>{d}</span>
                    {profs.slice(0,2).map(r=><div key={r.professorId} style={{ background:isSel?"rgba(255,255,255,.25)":"rgba(26,107,71,.12)", borderRadius:3, padding:"1px 3px", width:"100%" }}><p style={{ fontSize:7.5, fontWeight:800, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textAlign:"center", color:isSel?"#fff":"#40b07a" }}>{r.professor.split(" ")[0]}</p></div>)}
                    {profs.length>2&&<p style={{ fontSize:7, color:isSel?"rgba(255,255,255,.7)":C.textMuted }}>+{profs.length-2}</p>}
                  </button>
                ); })}
              </div>
              {diaMesSel&&(
                <div className="fade-in" style={{ marginTop:12, background:C.bg, borderRadius:10, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                  <p style={{ fontSize:12, fontWeight:700, color:C.navy, marginBottom:8 }}>{diaMesSel.split("-").reverse().join("/")}</p>
                  {(reservasPorData[diaMesSel]||[]).length===0 ? <p style={{ fontSize:13, color:C.textMuted }}>🎉 Dia livre.</p> : (
                    <div style={{ display:"grid", gap:5, marginBottom:10 }}>
                      {(reservasPorData[diaMesSel]||[]).sort((a,b)=>a.horario>b.horario?1:-1).map((r,i)=><div key={r.id||i} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 10px", borderRadius:8, background:C.surface, border:`1px solid ${C.border}`, borderLeft:`3px solid #40b07a` }}><span style={{ fontFamily:"'DM Mono',monospace", fontWeight:800, color:"#40b07a", fontSize:12, minWidth:38 }}>{r.horario}</span><span style={{ fontWeight:700, fontSize:12, flex:1, color:C.navy }}>{r.espaco}</span><span style={{ fontSize:11, color:C.textMid }}>{r.turma}</span><span style={{ fontSize:11, color:C.textMuted }}>{r.professor.split(" ")[0]}</span></div>)}
                    </div>
                  )}
                  {diaMesSel>=hoje&&<div style={{ borderTop:`1px solid ${C.border}`, paddingTop:10, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}><p style={{ fontSize:12.5, fontWeight:700, color:C.navy }}>Deseja agendar?</p><button onClick={()=>setMostrarLogin(true)} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"#40b07a", color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer" }}>Entrar para agendar →</button></div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <footer style={{ padding:"14px 20px", borderTop:`1px solid ${C.border}`, background:C.surface, textAlign:"center" }}>
        <p style={{ fontSize:11, color:C.textMuted }}>Colégio Arena · Reserva de Salas e Equipamentos · v1.4 · Dev: Luciano Galdino de Melo</p>
      </footer>
    </div>
  );
}

export default function App() {
  const [usuario,setUsuario] = useState(null); const [carregando,setCarregando] = useState(true);
  const [dark,setDark] = useState(()=>{ try { return localStorage.getItem("theme")==="dark"; } catch { return false; } });
  const toggle=()=>setDark(d=>{ const n=!d; try { localStorage.setItem("theme",n?"dark":"light"); } catch {} return n; });
  useEffect(()=>onAuthStateChanged(auth,async user=>{ if (user) { const snap=await getDoc(doc(db,"usuarios",user.uid)); setUsuario(snap.exists()?{uid:user.uid,...snap.data()}:{uid:user.uid,email:user.email,perfil:"sem_acesso",ativo:false}); } else setUsuario(null); setCarregando(false); }),[]);
  const C=dark?DARK:LIGHT;
  if (carregando) return <ThemeCtx.Provider value={{dark,toggle}}><GlobalStyle dark={dark} /><DarkToggle /><div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg }}><div style={{ textAlign:"center" }}><div style={{ width:60,height:60,borderRadius:15,background:C.logoBg,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",margin:"0 auto 14px" }}>{ARENA_LOGO?<img src={ARENA_LOGO} alt="Arena" style={{ width:48,height:48,objectFit:"contain" }} />:<span style={{fontSize:26}}>🏫</span>}</div><p style={{ color:C.textMuted,fontSize:14,fontWeight:600 }}>Carregando...</p></div></div></ThemeCtx.Provider>;
  if (!usuario) return <ThemeCtx.Provider value={{dark,toggle}}><GlobalStyle dark={dark} /><TelaPublica /></ThemeCtx.Provider>;
  if (usuario.perfil==="sem_acesso"||usuario.ativo===false) return <ThemeCtx.Provider value={{dark,toggle}}><GlobalStyle dark={dark} /><DarkToggle /><div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:"1rem" }}><div className="fade-in" style={{ textAlign:"center",maxWidth:380 }}><div style={{ width:72,height:72,borderRadius:18,background:C.redBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 20px" }}>🔒</div><h2 style={{ fontSize:20,fontWeight:800,color:C.navy,marginBottom:8 }}>Acesso não autorizado</h2><p style={{ fontSize:13.5,color:C.textMid,marginBottom:24 }}>A conta <strong>{usuario.email}</strong> não foi habilitada.</p><Btn onClick={()=>signOut(auth)} variant="navy">Sair</Btn></div></div></ThemeCtx.Provider>;
  return (
    <ThemeCtx.Provider value={{dark,toggle}}>
      <GlobalStyle dark={dark} />
      <div style={{ minHeight:"100vh", background:C.bg }} translate="no" lang="pt-BR">
        <header style={{ background:C.headerBg, borderBottom:C.headerBorder, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 6px rgba(19,35,24,.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}><Logo size={36} /><div><p style={{ fontSize:13, fontWeight:800, color:C.navy }}>Reserva de Salas e Equipamentos</p><p style={{ fontSize:10, color:C.textMuted }}>Colégio Arena</p></div></div>
            {usuario?.perfil==="admin"&&<AdminUsuariosBtn />}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <Avatar nome={usuario.nome} size={30} variant={usuario.perfil==="admin"?"purple":"navy"} />
            <div style={{ lineHeight:1.2 }}><p style={{ fontSize:13, fontWeight:700, color:C.navy }}>{usuario.nome}</p><p style={{ fontSize:10.5, color:usuario.perfil==="admin"?"#6d28d9":C.blueMid, fontWeight:700, textTransform:"uppercase" }}>{usuario.perfil}</p></div>
            <button onClick={toggle} style={{ background:dark?"#f1f5f9":"#0f172a", color:dark?"#0f172a":"#f1f5f9", border:"none", borderRadius:20, padding:"5px 12px", cursor:"pointer", fontSize:13, fontWeight:700 }}>{dark?"☀️ Claro":"🌙 Escuro"}</button>
            <Btn onClick={()=>signOut(auth)} variant="ghost" size="sm">Sair</Btn>
          </div>
        </header>
        {usuario.perfil==="admin"?<AdminView />:<ProfessorView usuario={usuario} />}
        <footer style={{ marginTop:40, padding:"20px 24px", borderTop:`1px solid ${C.border}`, background:C.surface }}>
          <div style={{ maxWidth:900, margin:"0 auto", display:"flex", flexWrap:"wrap", gap:16, alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}><Logo size={28} /><div><p style={{ fontSize:12, fontWeight:700, color:C.navy }}>Reserva de Salas e Equipamentos</p><p style={{ fontSize:10.5, color:C.textMuted }}>Colégio Arena · Versão 1.4</p></div></div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
              {[{icon:"👨‍💻",label:"Desenvolvedor",val:"Luciano Galdino de Melo"},{icon:"🔥",label:"Backend",val:"Firebase Firestore & Auth"},{icon:"⚛️",label:"Frontend",val:"React + Vite"},{icon:"📦",label:"Versão",val:"1.4.0"}].map(item=>(
                <div key={item.label} style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ fontSize:14 }}>{item.icon}</span><div><p style={{ fontSize:9.5, color:C.textMuted, textTransform:"uppercase", fontWeight:700 }}>{item.label}</p><p style={{ fontSize:11.5, color:C.textMid, fontWeight:600 }}>{item.val}</p></div></div>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </ThemeCtx.Provider>
  );
}
