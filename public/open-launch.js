const launchLink = document.getElementById('open-tabs');
const launchStatus = document.getElementById('open-tabs-status');
let opened = false;

function launchTabs() {
  if (opened) return true;
  const newTab = window.open(launchLink.href, '_blank');
  if (!newTab || newTab === window) {
    launchStatus.textContent = '自動で別タブが開かない場合は「両方を開く」を押してください。';
    return false;
  }
  newTab.opener = null;
  opened = true;
  window.location.replace('https://www.google.com/');
  return true;
}

launchLink.addEventListener('click', event => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (launchTabs()) event.preventDefault();
});
launchTabs();
