(function(){
  if(sessionStorage.getItem('casa_ok')==='1') return;
  var WORKER='https://precos-casa.automercadomario.workers.dev';   // a senha é conferida no servidor
  var ov = document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:#0F1613;display:flex;'
    +'align-items:center;justify-content:center;flex-direction:column;gap:14px;'
    +'font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#EAF1EC';
  ov.innerHTML='<div style="font-weight:800;font-size:21px">&#128274; Automa&ccedil;&atilde;o da Casa</div>'
    +'<div style="color:#94A89D;font-size:14px;margin-bottom:4px">&Aacute;rea da fam&iacute;lia</div>'
    +'<input id="_pw" type="password" placeholder="senha" autocomplete="off" '
    +'style="background:#1E2A25;border:1px solid #3A4C43;color:#EAF1EC;border-radius:10px;'
    +'padding:11px 14px;font-size:16px;width:220px;text-align:center">'
    +'<button id="_go" style="background:#56D98C;color:#08120c;border:0;border-radius:10px;'
    +'padding:10px 24px;font-weight:800;font-size:15px;cursor:pointer">entrar</button>'
    +'<div id="_er" style="color:#E8896B;font-size:13px;height:16px"></div>';
  (document.body||document.documentElement).appendChild(ov);
  function go(){
    var pw=document.getElementById('_pw').value, er=document.getElementById('_er');
    er.style.color='#94A89D'; er.textContent='entrando…';
    fetch(WORKER+'/entrar?senha='+encodeURIComponent(pw)).then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok){ sessionStorage.setItem('casa_ok','1'); if(j.token) localStorage.setItem('casa_token',j.token); location.reload(); }
      else { er.style.color='#E8896B'; er.textContent='senha incorreta'; }
    }).catch(function(){ er.style.color='#E8896B'; er.textContent='sem conexão — tente de novo'; });
  }
  ov.querySelector('#_go').onclick=go;
  ov.querySelector('#_pw').addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
  setTimeout(function(){ var p=document.getElementById('_pw'); if(p) p.focus(); },60);
})();