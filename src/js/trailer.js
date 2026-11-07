import {createTrailerControls} from './trailer-controls.js?v=__BUILD__';
import {createTrailerPlayer} from './trailer-player.js?v=__BUILD__';
import {translations,DEFAULT_LANGUAGE} from './i18n.js?v=__BUILD__';
const $=id=>document.getElementById(id),trigger=$('trailerTrigger'),dialog=$('trailerDialog');
if(trigger&&dialog){
 const text=key=>key?(translations[document.documentElement.lang]||translations[DEFAULT_LANGUAGE])[key]||translations.ru[key]||'':'';
 const playback=createTrailerPlayer({trigger,dialog,player:$('trailerPlayer'),video:$('trailerVideo'),closeButton:$('trailerClose'),status:$('trailerStatus'),doc:document,copy:text});
 const controls=createTrailerControls({video:$('trailerVideo'),player:$('trailerPlayer'),dialog,doc:document,copy:text,toggleFullscreen:playback.toggleFullscreen,ui:{bar:$('trailerControls'),play:$('trailerPlay'),centerPlay:$('trailerCenterPlay'),back:$('trailerBack'),forward:$('trailerForward'),seek:$('trailerSeek'),time:$('trailerTime'),mute:$('trailerMute'),volume:$('trailerVolume'),speed:$('trailerSpeed'),fullscreen:$('trailerFullscreen')}});
 const localize=()=>{controls.refresh();trigger.setAttribute('aria-label',text('trailerWatch'));$('trailerClose').setAttribute('aria-label',text('trailerClose'));$('trailerVideo').setAttribute('aria-label',text('trailerTitle'));dialog.querySelectorAll('[data-trailer-copy]').forEach(el=>{el.textContent=text(el.dataset.trailerCopy);});};
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});localize();
}
