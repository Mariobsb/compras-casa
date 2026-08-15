(function(){
  if(sessionStorage.getItem('casa_ok')==='1') return;
  var SENHA = atob('ZmFtaWxpYTIwMjY=');            // familia2026 — camada leve
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
    if(document.getElementById('_pw').value===SENHA){ sessionStorage.setItem('casa_ok','1'); ov.remove(); }
    else { document.getElementById('_er').textContent='senha incorreta'; }
  }
  ov.querySelector('#_go').onclick=go;
  ov.querySelector('#_pw').addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
  setTimeout(function(){ var p=document.getElementById('_pw'); if(p) p.focus(); },60);
})();