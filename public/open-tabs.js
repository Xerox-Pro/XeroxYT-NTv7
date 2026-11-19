const openTabs = document.getElementById('open-tabs');
const status = document.getElementById('open-tabs-status');

openTabs.addEventListener('click', () => {
  const xeroxTab = window.open('about:blank', '_blank');
  if (!xeroxTab) {
    status.textContent = '別タブを開けませんでした。下のリンクからXeroxYT-NTv7を開けます。';
    return;
  }

  xeroxTab.opener = null;
  xeroxTab.location.replace(new URL('/', window.location.origin).href);
  window.location.replace('https://www.google.com/');
});
