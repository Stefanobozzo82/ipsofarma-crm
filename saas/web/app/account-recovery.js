(function(global){
  'use strict';
  global.SaasAccountRecovery = function({ sb, $, show, setMsg, requested }){
    let active = Boolean(requested), recoveryView = Boolean(requested), verified = false;
    function openRecovery(){
      active = true;
      $('page-title').textContent = 'Scegli una nuova password';
      show('recovery-box');
      $('recovery-submit').disabled = !verified;
      if(!verified) setMsg('recovery-msg', 'Verifica del link in corso. Se il link è scaduto, richiedine uno nuovo.', 'error');
    }
    sb.auth.onAuthStateChange((event, session) => {
      if(event === 'PASSWORD_RECOVERY'){
        verified = Boolean(session); active = true; recoveryView = true; openRecovery();
        if(verified) setMsg('recovery-msg', '', '');
      }
    });
    $('forgot-password').addEventListener('click', () => {
      active = true; recoveryView = false; $('reset-email').value = $('email').value;
      $('page-title').textContent = 'Recupera password'; show('reset-box');
    });
    $('reset-form').addEventListener('submit', async event => {
      event.preventDefault();
      const email = $('reset-email').value.trim();
      if(!email || !$('reset-email').checkValidity()) return;
      $('reset-submit').disabled = true;
      try{
        const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + '/'});
        if(error) throw error;
        setMsg('reset-msg', 'Se esiste un account associato, riceverai un link per scegliere una nuova password. Controlla anche la posta indesiderata.', 'ok');
      }catch{
        setMsg('reset-msg', 'Invio non disponibile al momento. Attendi qualche minuto e riprova.', 'error');
      }finally{ $('reset-submit').disabled = false; }
    });
    $('recovery-form').addEventListener('submit', async event => {
      event.preventDefault();
      if(!verified){ setMsg('recovery-msg', 'Apri un nuovo link di recupero ricevuto via email.', 'error'); return; }
      const password = $('new-password').value;
      if(password.length < 12){ setMsg('recovery-msg', 'Usa almeno 12 caratteri.', 'error'); return; }
      if(password !== $('confirm-password').value){ setMsg('recovery-msg', 'Le password non coincidono.', 'error'); return; }
      $('recovery-submit').disabled = true;
      try{
        const {data, error: userError} = await sb.auth.getUser();
        if(userError || !data.user) throw Error('session');
        const {error} = await sb.auth.updateUser({password});
        if(error) throw error;
        $('new-password').value = ''; $('confirm-password').value = '';
        verified = false;
        await sb.auth.signOut({scope:'local'});
        setMsg('recovery-msg', 'Password aggiornata. Torna all’accesso e usa la nuova password.', 'ok');
      }catch{
        setMsg('recovery-msg', 'Password non aggiornata. Verifica i requisiti o richiedi un nuovo link.', 'error');
      }finally{ $('recovery-submit').disabled = !verified; }
    });
    for(const id of ['reset-back','recovery-back']) $(id).addEventListener('click', async () => {
      if(verified || requested) await sb.auth.signOut({scope:'local'});
      location.replace(location.origin + '/');
    });
    return {isActive:()=>active, showIfRequested(){ if(recoveryView) openRecovery(); }};
  };
})(window);
