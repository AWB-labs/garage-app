import React from 'react';

import { useSheetsStore } from '@/stores/sheets';
import { LogServiceSheet } from './LogServiceSheet';
import { NoteSheet } from './NoteSheet';
import { ReminderSheet } from './ReminderSheet';
import { ReportIssueSheet } from './ReportIssueSheet';
import { UpdateMileageSheet } from './UpdateMileageSheet';
import { VehicleSheet } from './VehicleSheet';

/** Presents whichever sheet a screen requested. Lives once in the root layout. */
export function SheetHost() {
  const current = useSheetsStore((s) => s.current);
  const close = useSheetsStore((s) => s.close);

  if (!current) return null;

  switch (current.kind) {
    case 'vehicle':
      return <VehicleSheet vehicle={current.vehicle} onClose={close} />;
    case 'logService':
      return (
        <LogServiceSheet
          vehicleId={current.vehicleId}
          service={current.service}
          resolvesIssueId={current.resolvesIssueId}
          prefillType={current.prefillType}
          prefillCustomLabel={current.prefillCustomLabel}
          onClose={close}
        />
      );
    case 'updateMileage':
      return <UpdateMileageSheet vehicleId={current.vehicleId} onClose={close} />;
    case 'reportIssue':
      return <ReportIssueSheet vehicleId={current.vehicleId} issue={current.issue} onClose={close} />;
    case 'note':
      return <NoteSheet vehicleId={current.vehicleId} note={current.note} onClose={close} />;
    case 'reminder':
      return <ReminderSheet vehicleId={current.vehicleId} rule={current.rule} onClose={close} />;
  }
}
