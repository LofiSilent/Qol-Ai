import {createTrailerPlayer} from './trailer-player.js?v=__BUILD__';
import {translations,DEFAULT_LANGUAGE} from './i18n.js?v=__BUILD__';
const $=id=>document.getElementById(id),trigger=$('trailerTrigger'),dialog=$('trailerDialog');
if(trigger&&dialog){
 const text=key=>key?(translations[document.documentElement.lang]||translations[DEFAULT_LANGUAGE])[key]||translations.ru[key]||'':'';
 createTrailerPlayer({trigger,dialog,player:$('trailerPlayer'),video:$('trailerVideo'),closeButton:$('trailerClose'),status:$('trailerStatus'),doc:document,copy:text});
 const localize=()=>{trigger.setAttribute('aria-label',text('trailerWatch'));$('trailerClose').setAttribute('aria-label',text('trailerClose'));$('trailerVideo').setAttribute('aria-label',text('trailerTitle'));dialog.querySelectorAll('[data-trailer-copy]').forEach(el=>{el.textContent=text(el.dataset.trailerCopy);});};
 new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});localize();
}
