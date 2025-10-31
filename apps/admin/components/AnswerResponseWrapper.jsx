
import React, { useState } from 'react';
import AnswerResponseEditor from './AnswerResponseEditor';

/**
 * AnswerResponseWrapper.jsx
 *
 * Renders two buttons in the mission form:
 * - "Open Correct Response" and "Open Wrong Response"
 * When clicked, mounts AnswerResponseEditor and tells it to auto-open the requested modal.
 */
export default function AnswerResponseWrapper({ editing, setEditing, inventory, createResponseMission }) {
  const [openInitial, setOpenInitial] = useState(null);
  const [mounted, setMounted] = useState(false);

  function open(which) {
    setOpenInitial(which);
    setMounted(true);
  }
  function close() {
    setMounted(false);
    setOpenInitial(null);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={{ padding: '6px 10px', borderRadius: 8 }} onClick={() => open('correct')}>Open Correct Response</button>
        <button style={{ padding: '6px 10px', borderRadius: 8 }} onClick={() => open('wrong')}>Open Wrong Response</button>
      </div>

      {mounted ? (
        <AnswerResponseEditor
          editing={editing}
          setEditing={setEditing}
          inventory={inventory}
          createResponseMission={createResponseMission}
          openInitial={openInitial}
        />
      ) : null}
    </div>
  );
}
