const https = require('https');
const key = '6eef39121b224a85bf291b86bd270bc3';
const opts = {
  hostname: 'api.football-data.org',
  path: '/v4/competitions/WC/matches?status=FINISHED,IN_PLAY,PAUSED,SCHEDULED',
  headers: { 'X-Auth-Token': key }
};
console.log('request sent');
const req = https.get(opts, (res) => {
  console.log('status:', res.statusCode);
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('total:', d.length);
    try {
      const j = JSON.parse(d);
      console.log('OK matches:', j.matches?.length);
    } catch(e) {
      console.log('PARSE FAIL:', e.message);
    }
  });
});
req.on('error', e => console.log('REQ ERROR:', e.message));
req.setTimeout(15000, () => { console.log('TIMEOUT'); req.destroy(); });
