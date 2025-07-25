require('dotenv').config();
const express = require('express');
const { create } = require('xmlbuilder2');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');

const app = express();

// create a pool once at startup
const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASS     || '',
  database:         process.env.DB_NAME     || 'vast_dev',
  waitForConnections:true,
  connectionLimit:  10,
  queueLimit:       0
});

app.get('/vast', (req, res) => {
  const sessionId = uuidv4();

  const xml = create({ version: '1.0' })
    .ele('VAST', { version: '3.0' })
      .ele('Ad')
        .ele('InLine')
          .ele('Creatives')
            .ele('Creative')
              .ele('Linear')
                .ele('Duration').txt('00:00:30').up()
                .ele('MediaFiles')
                  .ele('MediaFile', {
                    delivery: 'progressive',
                    type:     'video/mp4',
                    width:    640,
                    height:   360
                  })
                    .txt('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4')
                  .up()
                .up();

// … inside your /vast endpoint, after you build MediaFiles …

// wrap your Tracking elements in a <TrackingEvents> container:
const trackingEvents = xml
  .ele('TrackingEvents');

['start','firstQuartile','midpoint','thirdQuartile','complete','pause']
  .forEach(event => {
    const url = `http://trackingendpointdummy.com/track`
      + `?event=${event}`
      + `&session_id=${sessionId}`
      + `&page_url=[PAGEURL]`
      + `&cb=[CACHEBUSTING]`
      + '&gdpr=[GDPRCONSENT]';

    trackingEvents
      .ele('Tracking', { event })
        .dat(url)    // <-- this emits <![CDATA[your url]]>
      .up();
  });

trackingEvents.up();  // close <TrackingEvents>

  const xmlString = xml.end({ prettyPrint: true });
  res.type('application/xml').send(xmlString);
});

app.get('/track', async (req, res) => {
  const { event, session_id, page_url } = req.query;

  try {
    // Insert directly via mysql2 pool
    await pool.execute(
      `INSERT INTO tracking_events
         (session_id, event_type, page_url, created_at)
       VALUES (?, ?, ?, NOW())`,
      [
        session_id,
        event,
        decodeURIComponent(page_url || '')
      ]
    );
  } catch (err) {
    console.error('DB INSERT ERROR:', err);
    // even on error, we still want to return the 1x1 GIF
  }

  // 1×1 transparent GIF (in-memory)
  const img = Buffer.from(
    'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64'
  );
  res.type('image/gif').send(img);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VAST API listening on http://localhost:${PORT}`);
});
