// Ordinary browser visits do not need to wait for Telegram's external SDK.
export function connectTelegram(onReady){
 const connect=()=>{const app=window.Telegram?.WebApp;if(app?.initData)onReady(app);};
 if(window.Telegram?.WebApp){connect();return;}
 if(!/(?:^|[?#&])tgWebApp(?:Data|Platform|Version)=/.test(location.search+location.hash))return;
 const script=document.createElement('script');script.src='https://telegram.org/js/telegram-web-app.js?63';script.async=true;script.addEventListener('load',connect,{once:true});document.head.append(script);
}
