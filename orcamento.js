/* ===========================================================================
   ORÇAMENTO DA LISTA — quanto custa e onde comprar
   ---------------------------------------------------------------------------
   Pergunta que ele responde: "compro tudo num mercado só ou vale dividir?"

   Como decide:
   1. Busca o preço de cada item em cada mercado escolhido (o mesmo conjunto da
      engrenagem 🏪 da aba Produtos — chave casa_mercados no localStorage).
   2. MERCADO ÚNICO: soma o carrinho em cada loja. Só concorre a loja que cobre
      pelo menos 80% dos itens que ALGUÉM cobre — senão a loja que só tem arroz
      "ganharia" por ter o menor total.
   3. DOIS MERCADOS: testa todos os pares e, para cada item, leva o mais barato
      entre os dois. Com 12 lojas são 66 pares — trivial no celular.
   4. Só sugere dividir quando a divisão é EXECUTÁVEL e vale a pena:
      - nenhuma das duas lojas pode ficar abaixo do pedido mínimo de entrega
        (senão a "economia" não existe — o pedido nem sai);
      - a economia tem de passar de 6% E de R$ 8.
      O piso absoluto é baixo de propósito: um piso alto (R$ 15) reprovava
      divisões de 39% em listas pequenas, o que é obviamente errado. Quem
      decide de verdade é o pedido mínimo.

   Uma honestidade importante: o total é preço unitário × quantidade. Para item
   vendido a peso (2,5 kg de carne) isso é ESTIMATIVA, e a tela diz isso.
   =========================================================================== */
(function () {
  'use strict';

  var ECONOMIA_MIN_RS = 8;      // piso baixo: quem reprova divisão ruim é o pedido mínimo
  var ECONOMIA_MIN_PC = 0.06;   // 6%
  var COBERTURA_MIN = 0.8;      // fração da melhor cobertura p/ concorrer
  /* Concorrência baixa DE PROPÓSITO: orçar 15 itens em 8 lojas são ~120 buscas,
     e em rajada o Instabuy passa a recusar o IP (aconteceu em 16/08/2026 — as 6
     lojas Instabuy zeraram por alguns minutos). Com 2 por vez + o cache de 6h do
     Worker, a conta fecha. A primeira passada demora; a segunda é instantânea. */
  var PARALELO = 2;

  function selecaoMercados() {
    try {
      var a = JSON.parse(localStorage.getItem('casa_mercados'));
      return (Array.isArray(a) && a.length) ? a.join(',') : '';
    } catch (e) { return ''; }
  }

  /** Roda as tarefas com concorrência limitada, reportando progresso. */
  function emFila(itens, tarefa, aoAndar) {
    return new Promise(function (resolve) {
      var res = [], i = 0, vivos = 0, prontos = 0;
      function proximo() {
        if (i >= itens.length && vivos === 0) return resolve(res);
        while (vivos < PARALELO && i < itens.length) {
          (function (k) {
            vivos++; i++;
            tarefa(itens[k], k).then(function (r) { res[k] = r; })
              .catch(function () { res[k] = null; })
              .then(function () { vivos--; prontos++; aoAndar(prontos, itens.length); proximo(); });
          })(i);
        }
      }
      proximo();
    });
  }

  function precoEfetivo(l) { return l.promo || l.atacado || l.preco; }

  // ---- núcleo: matriz item × loja -> recomendação --------------------------
  function calcular(itens, respostas, lojas) {
    var porLoja = {};       // id -> {nome, min_entrega, itens:{itemId:{v,produto,pu}}}
    var cobertos = 0;

    itens.forEach(function (it, k) {
      var r = respostas[k];
      if (!r || !r.lojas || !r.lojas.length) return;
      cobertos++;
      r.lojas.forEach(function (l) {
        var v = precoEfetivo(l);
        if (!v) return;
        var id = l.id || l.loja;
        if (!porLoja[id]) porLoja[id] = { id: id, nome: l.loja, itens: {}, min_entrega: (lojas[id] || {}).min_entrega };
        var custo = v * (Number(it.qtd) || 1);
        var atual = porLoja[id].itens[it.id];
        if (!atual || custo < atual.custo)
          porLoja[id].itens[it.id] = { unit: v, custo: custo, produto: l.produto, pu: l.pu, match: l.match };
      });
    });

    var lista = Object.keys(porLoja).map(function (id) {
      var L = porLoja[id], ids = Object.keys(L.itens);
      return {
        id: id, nome: L.nome, min_entrega: L.min_entrega, n: ids.length,
        total: ids.reduce(function (s, k) { return s + L.itens[k].custo; }, 0), itens: L.itens
      };
    });
    if (!lista.length) return null;

    var maxCob = Math.max.apply(null, lista.map(function (l) { return l.n; }));
    var elegiveis = lista.filter(function (l) { return l.n >= maxCob * COBERTURA_MIN; });
    var unico = elegiveis.slice().sort(function (a, b) { return a.total - b.total; })[0];

    // melhor par: para cada item, o mais barato entre as duas lojas
    var par = null;
    for (var a = 0; a < lista.length; a++) {
      for (var b = a + 1; b < lista.length; b++) {
        var A = lista[a], B = lista[b], chaves = {}, total = 0, subA = 0, subB = 0, deA = [], deB = [];
        Object.keys(A.itens).forEach(function (k) { chaves[k] = 1; });
        Object.keys(B.itens).forEach(function (k) { chaves[k] = 1; });
        Object.keys(chaves).forEach(function (k) {
          var ca = A.itens[k], cb = B.itens[k];
          if (ca && (!cb || ca.custo <= cb.custo)) { total += ca.custo; subA += ca.custo; deA.push(k); }
          else if (cb) { total += cb.custo; subB += cb.custo; deB.push(k); }
        });
        var n = Object.keys(chaves).length;
        if (!par || n > par.n || (n === par.n && total < par.total))
          par = { n: n, total: total, A: A, B: B, subA: subA, subB: subB, deA: deA, deB: deB };
      }
    }

    var economia = par && unico ? unico.total - par.total : 0;
    // Divisão só existe se OS DOIS pedidos saírem: loja abaixo do próprio mínimo
    // de entrega não fecha compra, então a economia seria fictícia.
    var abaixoMin = null;
    if (par) {
      if (par.A.min_entrega && par.subA < par.A.min_entrega) abaixoMin = { loja: par.A, sub: par.subA };
      else if (par.B.min_entrega && par.subB < par.B.min_entrega) abaixoMin = { loja: par.B, sub: par.subB };
    }
    var vale = !!par && !!unico && par.n >= unico.n && !abaixoMin &&
      economia >= ECONOMIA_MIN_RS && economia >= unico.total * ECONOMIA_MIN_PC;

    // por que não dividiu — a tela explica em vez de só dizer "não compensa"
    var motivo = null;
    if (par && unico && !vale) {
      var rs = function (v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); };
      if (economia <= 0) motivo = 'dividir não sairia mais barato';
      else if (abaixoMin)
        motivo = 'dividir economizaria ' + rs(economia) + ', mas o ' + abaixoMin.loja.nome +
          ' ficaria em ' + rs(abaixoMin.sub) + ' — abaixo do pedido mínimo de ' + rs(abaixoMin.loja.min_entrega);
      else motivo = 'dividir economizaria só ' + rs(economia) + ', não paga a segunda entrega';
    }

    return {
      itens: itens, respostas: respostas, lojas: lista.sort(function (x, y) { return x.total - y.total; }),
      unico: unico, par: par, economia: economia, vale: vale, motivo: motivo, abaixoMin: abaixoMin,
      cobertos: cobertos, total_itens: itens.length, maxCob: maxCob
    };
  }

  // ---- render --------------------------------------------------------------
  function pintar(o, CASA) {
    if (!o) return '';
    if (o.erro) return '<div class="erro">' + CASA.esc(o.erro) + '</div>';
    if (o.progresso)
      return '<div class="orc"><h3>Orçando…</h3><p class="orcsub">' + o.progresso.feito + ' de ' + o.progresso.total +
        ' itens consultados nos mercados</p><div class="prog"><i style="width:' +
        Math.round(o.progresso.feito / o.progresso.total * 100) + '%"></i></div></div>';

    var m = CASA.money, esc = CASA.esc, r = o.res;
    if (!r) return '';
    var faltando = r.total_itens - r.cobertos;

    var html = '<div class="orc">';
    if (r.vale) {
      html += '<h3>Vale dividir em dois mercados</h3>'
        + '<div class="orctop"><span class="big">' + m(r.par.total) + '</span>'
        + '<span class="eco">economiza ' + m(r.economia) + ' (' + Math.round(r.economia / r.unico.total * 100) + '%)</span></div>'
        + '<p class="orcsub">contra ' + m(r.unico.total) + ' comprando tudo no ' + esc(r.unico.nome) + '</p>'
        + '<div style="margin-top:12px">'
        + linhaLoja(r.par.A, r.par.subA, r.par.deA, r, m, esc)
        + linhaLoja(r.par.B, r.par.subB, r.par.deB, r, m, esc)
        + '</div>';
    } else if (r.unico) {
      html += '<h3>Melhor num mercado só</h3>'
        + '<div class="orctop"><span class="big">' + m(r.unico.total) + '</span>'
        + '<span class="tag ok">' + esc(r.unico.nome) + '</span></div>'
        + '<p class="orcsub">' + r.unico.n + ' de ' + r.total_itens + ' itens'
        + (r.motivo ? ' · ' + esc(r.motivo) : '') + '</p>';
    }
    if (faltando)
      html += '<p class="orcsub" style="color:var(--amber);margin-top:10px">⚠ ' + faltando +
        ' item(ns) sem preço em nenhum mercado — confira na lista.</p>';
    html += '<p class="orcsub" style="margin-top:10px;font-size:12px;color:var(--faint)">'
      + 'Total = preço × quantidade. Para item vendido a peso, é estimativa.</p>';
    html += '</div>';

    // todas as lojas, para o Mario conferir
    html += '<div class="orc"><h3 style="margin-bottom:8px">Todos os mercados</h3>'
      + r.lojas.map(function (l) {
        var abaixo = l.min_entrega && l.total < l.min_entrega;
        return '<div class="lojarow"><div class="ln">' + esc(l.nome)
          + '<small>' + l.n + ' de ' + r.total_itens + ' itens'
          + (abaixo ? ' · abaixo do mínimo de ' + m(l.min_entrega) : '') + '</small></div>'
          + (abaixo ? '<span class="tag warn">mínimo</span>' : '')
          + '<span class="lv">' + m(l.total) + '</span></div>';
      }).join('') + '</div>';
    return html;
  }
  /** Uma loja da divisão: quanto e QUAIS itens comprar nela (sem os nomes, a
      sugestão não dá para executar no mercado). */
  function linhaLoja(L, sub, chaves, r, m, esc) {
    var abaixo = L.min_entrega && sub < L.min_entrega;
    var nomes = chaves.map(function (k) {
      var it = r.itens.filter(function (x) { return x.id === k; })[0];
      return it ? it.nome : k;
    });
    return '<div class="lojarow"><div class="ln">' + esc(L.nome)
      + '<small>' + esc(nomes.join(' · ')) + (abaixo ? ' — abaixo do mínimo de ' + m(L.min_entrega) : '') + '</small></div>'
      + (abaixo ? '<span class="tag warn">mínimo</span>' : '<span class="tag ok">ok</span>')
      + '<span class="lv">' + m(sub) + '</span></div>';
  }

  // ---- entrada -------------------------------------------------------------
  window.orcamentoHTML = pintar;

  /** Backend de casa quando estiver de pé (IP doméstico, sem teto de lojas);
      senão o Worker público. Mesma preferência da aba Produtos. */
  function base() {
    return fetch('/api/health').then(function (r) { return r.json(); })
      .then(function (h) { return (h && h.ok) ? '/api' : null; })
      .catch(function () { return null; });
  }

  window.orcarLista = function (lista, CASA) {
    var itens = (lista.itens || []).filter(function (i) { return !i.ok; });   // o que ainda falta comprar
    if (!itens.length) return alert('Nada para orçar: todos os itens já estão marcados.');

    var sel = selecaoMercados();
    var qs = sel ? '&lojas=' + encodeURIComponent(sel) : '';
    CASA.setOrcamento({ progresso: { feito: 0, total: itens.length } });

    base().then(function (local) {
      var API = local || CASA.WORKER;

      // catálogo de lojas: só para saber o pedido mínimo de entrega de cada uma
      var lojasPromise = fetch(API + '/lojas').then(function (r) { return r.json(); })
        .then(function (j) { var m = {}; (j.lojas || []).forEach(function (l) { m[l.id] = l; }); return m; })
        .catch(function () { return {}; });

      emFila(itens, function (it) {
        var termo = encodeURIComponent(it.termo || ((it.marca ? it.marca + ' ' : '') + it.nome));
        var ean = it.ean ? '&ean=' + encodeURIComponent(it.ean) : '';
        return fetch(API + '/precos?termo=' + termo + ean + qs).then(function (r) { return r.json(); });
      }, function (feito, total) {
        CASA.setOrcamento({ progresso: { feito: feito, total: total } });
      }).then(function (respostas) {
        lojasPromise.then(function (lojas) {
          var res = calcular(itens, respostas, lojas);
          if (!res) return CASA.setOrcamento({ erro: 'nenhum preço encontrado para os itens desta lista.' });
          CASA.setOrcamento({ res: res });
          gravarPrecos(lista, res, CASA);
        });
      });
    });
  };

  /** Guarda o melhor preço de cada item na própria lista, para aparecer sem reorçar. */
  function gravarPrecos(lista, res, CASA) {
    var melhorLoja = res.vale ? null : res.unico;
    var ops = [];
    (lista.itens || []).forEach(function (it) {
      var alvo = null, nome = null;
      if (melhorLoja && melhorLoja.itens[it.id]) { alvo = melhorLoja.itens[it.id]; nome = melhorLoja.nome; }
      else {                                    // dividido: mostra o mais barato entre as duas
        [res.par && res.par.A, res.par && res.par.B].forEach(function (L) {
          if (L && L.itens[it.id] && (!alvo || L.itens[it.id].custo < alvo.custo)) { alvo = L.itens[it.id]; nome = L.nome; }
        });
      }
      if (alvo) ops.push({ op: 'item_lista', lista: lista.id, ref: it.ref, id: it.id, preco: alvo.unit, loja: nome });
    });
    if (ops.length && window.CASA_OPS) window.CASA_OPS(ops);
  }
})();
