// Generated from the prototype. Static markup only: the engine fills it by element id.
export default function Markup() {
  return (
    <>
<nav><b>Gold Quant</b><button className="btn" id="nw" style={{marginLeft:"auto"}}>Refresh</button><label className="btn">Import CSV<input type="file" id="fi" accept=".csv" hidden /></label></nav>
<main>
<section>
 <div style={{"position":"relative"}}><button id="cam" title="Download chart as PNG" aria-label="Download chart as PNG"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
 <div className="mut quote-meta"><span>XAU/USD</span><span id="dt"></span></div>
 <h1 id="pv"></h1><div className="d" id="d1"></div><div className="d sp" id="d2"></div></div>
 <canvas id="chart"></canvas>
 <div className="rng" id="rng"></div>
 <div className="rng o" id="ov"></div>
 <h2 className="h">Driver attribution</h2><div className="sub">Share of gold’s 60-day return variance each factor explains (OLS shares sum to R²). The regime label is a heuristic: a factor needs at least 5% and the model at least 10% of variance, otherwise gold is moving on something else.</div>
 <div style={{"display":"flex","gap":"28px","alignItems":"flex-start","flexWrap":"wrap"}}><div style={{"minWidth":"200px"}}><div className="mut">Regime now</div><div className="sig" id="rg"></div><div className="mut" id="rgd"></div></div>
 <table className="ch" id="at" style={{"flex":"1","minWidth":"300px"}}><thead><tr><th>Driver</th><th>Now (60d)</th><th>Baseline (250d)</th></tr></thead><tbody></tbody></table></div>
 <div className="mut" style={{"margin":"14px 0 4px"}}>Driver share over the chart range (60d rolling)</div><canvas id="dh" style={{"height":"150px"}}></canvas>
 <h2 className="h">Correlation benchmark</h2><div className="sub">Daily returns, ending today. Real yield uses the daily change in yield. Regime flags five straight days outside the reading’s own 10th to 90th percentile. Greyed cells are not distinguishable from zero at 95%.</div>
 <div className="mut" style={{"margin":"6px 0 4px"}}>Rolling 60-day correlation (dashed: ±0.25, the 95% significance line)</div><canvas id="rcc" style={{"height":"170px"}}></canvas>
 <table className="ch" id="ct"><thead><tr><th>Factor</th><th>30d</th><th>60d</th><th>90d</th><th>60d history</th><th>Regime</th></tr></thead><tbody></tbody></table>
 <h2 className="h">Factor model</h2><div className="sub">Rolling 60-day OLS of gold returns on the three factors. Residual z is today’s move the factors don’t explain, scored against a fit that excludes today.</div>
 <div className="stats" id="fm"></div>
 <div className="mut" style={{"margin":"18px 0 4px"}}>Residual z, last 250 days (dashed: signal threshold)</div><canvas id="rz" style={{"height":"150px"}}></canvas>
 <h2 className="h">Context signals</h2><div className="sub">Not in the regression: they feed the bias card. Percentile is vs the full sample.</div>
 <table className="ch" id="cx"><thead><tr><th>Series</th><th>Last</th><th>20d change</th><th>Percentile</th><th>1Y</th></tr></thead><tbody></tbody></table>
 <h2 className="h">Event reactions</h2><div className="sub">Gold close-to-close move on release days. Greyed means not significant at 95%. Samples are small, so treat as descriptive.</div>
 <div className="f" style={{"maxWidth":"340px"}}>Regime filter<select id="er" style={{"width":"180px"}}><option value="all">All regimes</option><option value="cur">Current regime only</option></select></div>
 <table className="ch" id="et"><thead><tr><th>Event</th><th>N</th><th>Mean move</th><th>Median</th><th>Avg |move| (× normal)</th><th>Up %</th></tr></thead><tbody></tbody></table>
</section>
<aside>
 <div className="card"><h2>Fundamental bias</h2><div className="sig" id="bl"></div><div className="mut" id="bs"></div><div id="bv" style={{"marginTop":"8px"}}></div><div className="note" id="bf"></div><div className="note" id="bx"></div><div className="note">Weights and thresholds are placeholders, not fitted or validated. Use as a filter for your chart, not an entry signal.</div></div>
 <div className="card"><h2>Alerts</h2><div id="al"></div><div className="note">Evaluated on each history refresh.</div></div>
 <div className="card"><h2>Signal</h2><div className="mut">Fade rule: bet against unexplained moves</div><div className="sig" id="sg"></div><div className="mut" id="sgd"></div></div>
 <div className="card"><h2>Walk-forward backtest</h2>
  <div className="f">Rule tested<select id="bm" style={{"width":"150px"}}><option value="bias">Bias score</option><option value="fade">Fade residual</option></select></div>
  <div className="f">Train share<span><b id="tsv"></b> <input type="range" id="spl" min="50" max="80" step="5" defaultValue="60" /></span></div>
  <div className="f">Cost (bps per trade)<input id="cb" type="number" min="0" step="0.5" defaultValue="1" /></div>
  <div className="f">Execution<select id="dl" style={{"width":"150px"}}><option value="0">Next day (base)</option><option value="1">1 day late</option><option value="2">2 days late</option></select></div>
  <table className="ch" id="bt"><thead><tr><th></th><th>Train</th><th>Test</th></tr></thead><tbody></tbody></table>
  <table className="ch" id="sx" style={{"marginTop":"10px"}}><thead><tr><th>Stress (test period)</th><th>Sharpe</th><th>t</th></tr></thead><tbody></tbody></table>
  <canvas id="eq" style={{"height":"120px","marginTop":"10px"}}></canvas><div className="note" id="vd"></div><div className="note" id="tl"></div></div>
 <div className="card"><h2>Data wiring</h2><div className="note" id="src" role="status"></div><table className="ch" id="dw"><thead><tr><th>Series</th><th>Last bar</th><th>Lag (d)</th><th>Status</th></tr></thead><tbody></tbody></table></div>
</aside>
</main>
    </>
  );
}
