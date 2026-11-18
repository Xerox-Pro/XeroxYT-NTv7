import React from 'react';

export default function TransportSettings() {
  return <section className="transport-settings">
    <h3>APIの接続方法</h3>
    <p>Vercelプロキシ経由（固定）</p>
    <p>アプリのAPI通信はすべてこのサイトのサーバーを経由します。ブラウザからCloudflare WorkerやGASのAPIへ直接接続することはありません。</p>
  </section>;
}
