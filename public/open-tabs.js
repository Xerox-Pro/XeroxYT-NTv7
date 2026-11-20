const openTabs = document.getElementById('open-tabs');
const status = document.getElementById('open-tabs-status');

function launchTabs() {
  const xeroxTab = window.open('about:blank', '_blank');
  if (!xeroxTab) {
    status.textContent = '自動で別タブが開かない場合は「両方を開く」を押してください。';
    return;
  }

  xeroxTab.opener = null;
  xeroxTab.location.replace(new URL('/', window.location.origin).href);
  window.location.replace('https://www.google.com/');
}

openTabs.addEventListener('click', launchTabs);
launchTabs();
