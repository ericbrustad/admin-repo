// AppDemo.jsx
import React, { useState } from 'react';
import DevicesList from './components/DevicesList';
import InlineMissionResponses from './components/InlineMissionResponses';
import MissionListItem from './components/MissionListItem';

export default function AppDemo() {
  const [devices, setDevices] = useState([
    { id: 'D1', name: 'rhr • smoke', lat: 44.9778, lng: -93.265, thumbnailUrl: '', hasResponses: true },
    { id: 'D2', name: 'Clone • clone', lat: 44.9778, lng: -93.265, thumbnailUrl: '', hasResponses: false },
  ]);

  const [triggerDevices] = useState([
    { id: 'D1', name: 'D1 — rhr' },
    { id: 'D2', name: 'D2 — clone' }
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

  function handleSelect(device) {
    console.log('select', device.id);
  }

  function handleUpdate(updated) {
    setDevices(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
  }

  const [missions] = useState([
    { id: 'M1', title: 'Welcome Mission', thumbnailUrl: '', hasResponses: true },
    { id: 'M2', title: 'Find the Flag', thumbnailUrl: '', hasResponses: false },
  ]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12, padding: 12 }}>
      <div>
        <h3 style={{ marginTop: 0 }}>Devices</h3>
        <DevicesList devices={devices} triggerDevices={triggerDevices} onReorder={handleReorder} onSelect={handleSelect} onUpdate={handleUpdate} />
      </div>

      <div>
        <h3>Missions (demo)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {missions.map(m => <MissionListItem key={m.id} mission={m} onClick={() => console.log('open mission', m.id)} />)}
        </div>

        <div style={{ marginTop: 20 }}>
          <h4>Inline Mission Responses</h4>
          <InlineMissionResponses value={{ onCorrect: { statement: 'Nice!', isTrigger: false } }} onChange={(v) => console.log('responses', v)} />
        </div>
      </div>
    </div>
  );
}
