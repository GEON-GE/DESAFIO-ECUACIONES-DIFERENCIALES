(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const initial = { c0: 0.50, ce: 0.10, k: 0.20, tEnd: 10, h1: 1, h2: 0.5 };
  let concentrationChart = null;
  let errorChart = null;
  let results = null;

  const fmt = (value, digits = 8) => Number(value).toFixed(digits);
  const cleanZero = (x) => Math.abs(x) < 1e-14 ? 0 : x;
  const f = (t, c, k, ce) => -k * (c - ce);
  const exact = (t, c0, ce, k) => ce + (c0 - ce) * Math.exp(-k * t);

  function integrateHeun({ c0, ce, k, tEnd, h }) {
    const rows = [{ n: 0, t: 0, value: c0 }];
    let t = 0, c = c0, n = 0;
    const count = Math.round(tEnd / h);
    for (let i = 0; i < count; i++) {
      const k1 = f(t, c, k, ce);
      const predictor = c + h * k1;
      const k2 = f(t + h, predictor, k, ce);
      const next = c + (h / 2) * (k1 + k2);
      t = (i + 1) * h;
      c = cleanZero(next);
      n++;
      rows.push({ n, t, value: c });
    }
    return rows;
  }

  function integrateRK4({ c0, ce, k, tEnd, h }) {
    const rows = [{ n: 0, t: 0, value: c0 }];
    let t = 0, c = c0, n = 0;
    const count = Math.round(tEnd / h);
    for (let i = 0; i < count; i++) {
      const k1 = f(t, c, k, ce);
      const k2 = f(t + h / 2, c + h * k1 / 2, k, ce);
      const k3 = f(t + h / 2, c + h * k2 / 2, k, ce);
      const k4 = f(t + h, c + h * k3, k, ce);
      const next = c + (h / 6) * (k1 + 2*k2 + 2*k3 + k4);
      t = (i + 1) * h;
      c = cleanZero(next);
      n++;
      rows.push({ n, t, value: c });
    }
    return rows;
  }

  function readParameters() {
    return {
      c0: Number($("c0").value),
      ce: Number($("ce").value),
      k: Number($("k").value),
      tEnd: Number($("tEnd").value),
      h1: Number($("h1").value),
      h2: Number($("h2").value)
    };
  }

  function validate(p) {
    const values = Object.values(p);
    if (!values.every(Number.isFinite)) return "Todos los campos deben contener números válidos.";
    if (p.c0 < 0 || p.ce < 0) return "Las concentraciones no pueden ser negativas.";
    if (p.k <= 0) return "La constante k debe ser mayor que cero.";
    if (p.tEnd <= 0) return "El tiempo final debe ser mayor que cero.";
    if (p.h1 <= 0 || p.h2 <= 0) return "Los tamaños de paso deben ser mayores que cero.";
    if (p.h1 > p.tEnd || p.h2 > p.tEnd) return "Cada tamaño de paso debe ser menor o igual al tiempo final.";
    const q1 = p.tEnd / p.h1, q2 = p.tEnd / p.h2;
    if (Math.abs(q1 - Math.round(q1)) > 1e-9 || Math.abs(q2 - Math.round(q2)) > 1e-9) {
      return "El tiempo final debe ser divisible por h₁ y h₂. Ajusta los pasos para obtener un número entero de iteraciones.";
    }
    if (Math.round(q1) > 5000 || Math.round(q2) > 5000) return "El número de iteraciones es demasiado grande. Utiliza pasos mayores.";
    return "";
  }

  function addErrors(rows, p) {
    return rows.map(row => {
      const reference = exact(row.t, p.c0, p.ce, p.k);
      const abs = Math.abs(row.value - reference);
      const rel = reference === 0 ? null : abs / Math.abs(reference) * 100;
      return { ...row, reference, abs, rel };
    });
  }

  function calculate(p) {
    const h1 = {
      heun: addErrors(integrateHeun({ ...p, h: p.h1 }), p),
      rk4: addErrors(integrateRK4({ ...p, h: p.h1 }), p)
    };
    const h2 = {
      heun: addErrors(integrateHeun({ ...p, h: p.h2 }), p),
      rk4: addErrors(integrateRK4({ ...p, h: p.h2 }), p)
    };
    return { p, h1, h2 };
  }

  function showValidation(message, isError = false) {
    const el = $("validationMessage");
    el.textContent = message;
    el.className = message ? `validation ${isError ? "error" : "success"}` : "validation";
  }

  function updateMetrics(r) {
    const p = r.p;
    const final = exact(p.tEnd, p.c0, p.ce, p.k);
    const reduction = p.c0 === 0 ? null : ((p.c0 - final) / p.c0) * 100;
    $("metricInitial").textContent = fmt(p.c0, 6);
    $("metricFinal").textContent = fmt(final, 6);
    $("metricReduction").textContent = reduction === null ? "—" : `${fmt(reduction, 2)}%`;
  }

  function renderComparison(r) {
    const items = [
      ["Heun · h₁", r.h1.heun.at(-1)],
      ["Heun · h₂", r.h2.heun.at(-1)],
      ["RK4 · h₁", r.h1.rk4.at(-1)],
      ["RK4 · h₂", r.h2.rk4.at(-1)]
    ];
    $("comparisonCards").innerHTML = items.map(([name, row]) => `
      <article class="compare-card">
        <span>${name}</span>
        <strong>${fmt(row.value, 8)}</strong>
        <small>mg/L · Error abs.: ${row.abs.toExponential(3)}</small>
      </article>`).join("");
  }

  function renderTable() {
    if (!results) return;
    const method = $("methodSelect").value;
    const step = $("stepSelect").value;
    const rows = results[step][method];
    const tbody = $("iterationTable").querySelector("tbody");
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.n}</td>
        <td>${fmt(row.t, 4)}</td>
        <td>${fmt(row.reference, 8)}</td>
        <td><b>${fmt(row.value, 8)}</b></td>
        <td>${row.abs.toExponential(4)}</td>
        <td>${row.rel === null ? "—" : `${row.rel.toExponential(4)}%`}</td>
      </tr>`).join("");
  }

  function renderCharts(r) {
    if (typeof Chart === "undefined") {
      showValidation("No se pudo cargar Chart.js. Revisa tu conexión a internet para mostrar las gráficas.", true);
      return;
    }
    const datasets = [
      { label: "Analítica", data: Array.from({length:101},(_,i)=>{const t=r.p.tEnd*i/100;return {x:t,y:exact(t,r.p.c0,r.p.ce,r.p.k)}}), borderColor:"#173f50", backgroundColor:"#173f50", borderWidth:3, pointRadius:0, showLine:true, tension:.25 },
      { label: "Heun h₁", data:r.h1.heun.map(v=>({x:v.t,y:v.value})), borderColor:"#d5a64b", backgroundColor:"#d5a64b", borderWidth:1.8, pointRadius:2, showLine:true },
      { label: "Heun h₂", data:r.h2.heun.map(v=>({x:v.t,y:v.value})), borderColor:"#e69b70", backgroundColor:"#e69b70", borderWidth:1.8, pointRadius:1.5, showLine:true },
      { label: "RK4 h₁", data:r.h1.rk4.map(v=>({x:v.t,y:v.value})), borderColor:"#168b88", backgroundColor:"#168b88", borderWidth:2, pointRadius:2, showLine:true },
      { label: "RK4 h₂", data:r.h2.rk4.map(v=>({x:v.t,y:v.value})), borderColor:"#75bca8", backgroundColor:"#75bca8", borderWidth:2, pointRadius:1.5, showLine:true }
    ];
    const ctx = $("concentrationChart").getContext("2d");
    if (concentrationChart) concentrationChart.destroy();
    concentrationChart = new Chart(ctx, {
      type:"scatter",
      data:{datasets},
      options:{
        responsive:true, maintainAspectRatio:false, parsing:false,
        interaction:{mode:"nearest",intersect:false},
        plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:7,font:{family:"DM Sans",size:10}}},tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ${c.parsed.y.toFixed(8)} mg/L · ${c.parsed.x} h`}}},
        scales:{
          x:{type:"linear",title:{display:true,text:"Tiempo (horas)",color:"#6c8189",font:{size:10}},grid:{color:"#edf2f1"},ticks:{color:"#71858b"}},
          y:{title:{display:true,text:"Concentración (mg/L)",color:"#6c8189",font:{size:10}},grid:{color:"#edf2f1"},ticks:{color:"#71858b"}}
        }
      }
    });
    const errors = [
      {label:"Heun h₁",value:r.h1.heun.at(-1).abs,color:"#d5a64b"},
      {label:"Heun h₂",value:r.h2.heun.at(-1).abs,color:"#e69b70"},
      {label:"RK4 h₁",value:r.h1.rk4.at(-1).abs,color:"#168b88"},
      {label:"RK4 h₂",value:r.h2.rk4.at(-1).abs,color:"#75bca8"}
    ];
    const ectx = $("errorChart").getContext("2d");
    if (errorChart) errorChart.destroy();
    errorChart = new Chart(ectx,{
      type:"bar",
      data:{labels:errors.map(e=>e.label),datasets:[{label:"Error absoluto (mg/L)",data:errors.map(e=>e.value),backgroundColor:errors.map(e=>e.color),borderRadius:7,maxBarThickness:42}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Error: ${c.raw.toExponential(5)} mg/L`}}},scales:{x:{grid:{display:false},ticks:{color:"#71858b",font:{size:10}}},y:{beginAtZero:true,grid:{color:"#edf2f1"},ticks:{callback:v=>Number(v).toExponential(1),color:"#71858b",font:{size:9}}}}}
    });
  }

  function renderInterpretation(r) {
    const p = r.p;
    const exactFinal = exact(p.tEnd,p.c0,p.ce,p.k);
    const candidates = [
      ["Heun h₁",r.h1.heun.at(-1)],["Heun h₂",r.h2.heun.at(-1)],
      ["RK4 h₁",r.h1.rk4.at(-1)],["RK4 h₂",r.h2.rk4.at(-1)]
    ];
    candidates.sort((a,b)=>a[1].abs-b[1].abs);
    const best = candidates[0];
    const reduction = p.c0 === 0 ? null : ((p.c0-exactFinal)/p.c0)*100;
    const text = `Con los parámetros actuales, la solución analítica estima ${fmt(exactFinal,8)} mg/L al cabo de ${fmt(p.tEnd,4)} horas. `;
    const reductionText = reduction === null ? "" : `La variación respecto a C₀ equivale a ${fmt(reduction,2)}% de reducción en el modelo. `;
    const methodText = `${best[0]} presentó el menor error absoluto final (${best[1].abs.toExponential(4)} mg/L) entre los cuatro ensayos. `;
    const behavior = p.c0 > p.ce ? "La concentración se aproxima al equilibrio desde arriba." : p.c0 < p.ce ? "La concentración se aproxima al equilibrio desde abajo." : "La concentración permanece constante porque C₀ y Cₑ son iguales.";
    $("interpretationBox").innerHTML = `<div class="interpret-icon">↗</div><div><h3>Interpretación automática</h3><p>${text}${reductionText}${methodText}${behavior} Estos resultados describen el modelo hipotético, no una medición de agua real ni una certificación de potabilidad.</p></div>`;
  }

  function run() {
    const p = readParameters();
    const error = validate(p);
    if (error) {
      showValidation(error, true);
      return;
    }
    results = calculate(p);
    updateMetrics(results);
    renderComparison(results);
    renderTable();
    renderCharts(results);
    renderInterpretation(results);
    const note = p.c0 === p.ce ? " C₀ y Cₑ son iguales: la solución permanece constante." : "";
    showValidation("Simulación calculada correctamente. Se actualizaron tablas, gráficas y errores." + note, false);
  }

  $("parameterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });
  $("methodSelect").addEventListener("change", renderTable);
  $("stepSelect").addEventListener("change", renderTable);
  $("resetBtn").addEventListener("click", () => {
    Object.entries(initial).forEach(([key,value]) => $(key).value = value);
    run();
  });

  run();
})();