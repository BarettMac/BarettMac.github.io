(function(){
"use strict";
var STORAGE_KEY = 'theme';

function current(){
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

document.addEventListener('DOMContentLoaded', function(){
  var btn = document.getElementById('theme');
  if(!btn) return;
  btn.textContent = current()==='dark' ? 'Light mode' : 'Dark mode';
  btn.onclick = function(){
    var next = current()==='dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch(e){}
    btn.textContent = next==='dark' ? 'Light mode' : 'Dark mode';
    document.dispatchEvent(new CustomEvent('themechange', {detail:{theme:next}}));
  };
});
})();
