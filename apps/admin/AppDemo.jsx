import React, { useState } from 'react';
import DevicesList from './components/DevicesList';
import InlineMissionResponses from './components/InlineMissionResponses';
import MissionListItem from './components/MissionListItem';
import MediaPool from './components/MediaPool';

export default function AppDemo() {
  const [devices, setDevices] = useState([
    { id: 'D1', name: 'ii • smoke', lat: 44.9778, lng: -93.265, thumbnailUrl: '', triggeredTicker: '', triggerTargetId: '', enableOnCorrect: false, enableOnWrong: false, hasResponses: true },
    { id: 'D2', name: 'ii • smoke', lat: 44.9778, lng: -93.265, thumbnailUrl: '', triggeredTicker: 'D2', triggerTargetId: '', enableOnCorrect: false, enableOnWrong: false, hasResponses: false },
  ]);

  const [missions, setMissions] = useState([
    { id: 'M1', title: 'Welcome', thumbnailUrl: '', hasResponses: true, isTrigger: false, responseThumb: '' },
    { id: 'M2', title: 'Find the Flag', thumbnailUrl: '', hasResponses: false, isTrigger: false, responseThumb: '' },
  ]);

  const [media, setMedia] = useState([
    { id: 'img1', url: 'https://placekitten.com/400/240', type: 'image', tags: ['response-trigger'] },
    { id: 'vid1', url: '', type: 'video', tags: [] },
    { id: 'aud1', url: '', type: 'audio', tags: ['geotrigger-device'] },
  ]);

  function handleReorder(id, dir) {
    const ix = devices.findIndex(d => d.id === id);
    if (ix === -1) return;
    const arr = [...devices];
    const swap = dir === 'up' ? ix - 1 : ix + 1;
    if (swap < 0 || swap >= arr.length) return;
    const tmp = arr[swap];
    arr[swap] = arr[ix];
    arr[ix] = tmp;
    setDevices(arr);
  }

  function handleUpdateDevice(updated) {
    setDevices(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
  }

  function handleOpenMission(m) {
    setMissions(prev => prev.map(x => x.id === m.id ? { ...x, isTrigger: !x.isTrigger } : x));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr 360px', gap: 12, padding: 12 }}>
      <div>
        <h3>Devices</h3>
        <DevicesList devices={devices} triggerDevices={devices} onReorder={handleReorder} onUpdate={handleUpdateDevice} />
      </div>

      <div>
        <h3>Missions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {missions.map(m => <MissionListItem key={m.id} mission={m} onClick={handleOpenMission} />)}
        </div>

        <div style={{ marginTop: 20 }}>
          <h4>Inline Mission Responses</h4>
          <InlineMissionResponses mediaPool={media} value={{ onCorrect: { enabled: false }, onWrong: { enabled: false } }} onChange={(v) => console.log('responses', v)} />
        </div>
      </div>

      <div>
        <h3>Media Pool</h3>
        <MediaPool media={media} onSelect={(m) => console.log('selected', m.id)} />
      </div>
    </div>
  );
}
