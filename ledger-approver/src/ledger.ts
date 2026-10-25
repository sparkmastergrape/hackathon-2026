import { ConsoleLogger, DeviceActionStatus, DeviceManagementKitBuilder, type DeviceManagementKit, type DeviceSessionId } from '@ledgerhq/device-management-kit';
import { SignerXrpBuilder } from '@ledgerhq/device-signer-kit-xrp';
import { speculosIdentifier, speculosTransportFactory } from '@ledgerhq/device-transport-kit-speculos';
import { webHidIdentifier, webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid';
import { firstValueFrom } from 'rxjs';
import { toXrplPublicKey } from '../shared/keys.mjs';

export const XRP_PATH = "44'/144'/0'/0/0";
export type TransportKind = 'usb' | 'speculos';

// Build the DMK once and share it.
const dmk: DeviceManagementKit = new DeviceManagementKitBuilder()
  .addLogger(new ConsoleLogger())
  .addTransport(webHidTransportFactory)
  .addTransport(speculosTransportFactory('http://127.0.0.1:5000'))
  .build();

type Action = { observable: any; cancel: () => void };

// Signer methods return { observable, cancel }. Turn one into a promise and report what the person must do on the device.
function run<T>(action: Action, onPending: (what: string) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    action.observable.subscribe({
      next: (state: any) => {
        if (state.status === DeviceActionStatus.Pending) onPending(String(state.intermediateValue?.requiredUserInteraction ?? 'none'));
        else if (state.status === DeviceActionStatus.Completed) resolve(state.output as T);
        else if (state.status === DeviceActionStatus.Error) reject(state.error instanceof Error ? state.error : new Error(JSON.stringify(state.error)));
        else if (state.status === DeviceActionStatus.Stopped) reject(new Error('Cancelled on the device.'));
      },
      error: reject,
    });
  });
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

export type Session = { sessionId: DeviceSessionId; address: string; publicKey: string; appVersion?: string };

// Must be called from a click handler: WebHID needs a user gesture to open its device picker.
export async function connect(kind: TransportKind, onPending: (w: string) => void): Promise<Session> {
  const device = await firstValueFrom(dmk.startDiscovering({ transport: kind === 'usb' ? webHidIdentifier : speculosIdentifier }));
  const sessionId = await dmk.connect({ device });
  const signer = new SignerXrpBuilder({ dmk, sessionId }).build();
  const cfg = await run<{ version: string }>(signer.getAppConfig(), onPending).catch(() => undefined);
  const a = await run<{ address: string; publicKey: string }>(signer.getAddress(XRP_PATH, { checkOnDevice: false }), onPending);
  return { sessionId, address: a.address, publicKey: toXrplPublicKey(a.publicKey), appVersion: cfg?.version };
}

export async function verifyAddressOnDevice(s: Session, onPending: (w: string) => void) {
  const signer = new SignerXrpBuilder({ dmk, sessionId: s.sessionId }).build();
  return run(signer.getAddress(XRP_PATH, { checkOnDevice: true }), onPending);
}

// Sign the serialized transaction. The XRP app adds the signing prefix itself, so pass encode(tx), not encodeForSigning.
// Returns the DER signature as uppercase hex, ready for TxnSignature.
export async function signTransaction(s: Session, txHex: string, onPending: (w: string) => void): Promise<string> {
  const signer = new SignerXrpBuilder({ dmk, sessionId: s.sessionId }).build();
  const out: unknown = await run(signer.signTransaction(XRP_PATH, fromHex(txHex)), onPending);
  if (out instanceof Uint8Array) return toHex(out);
  throw new Error(`Unexpected signature shape from the signer: ${JSON.stringify(out)}. Expected a DER signature (Uint8Array).`);
}

export async function disconnect(s: Session) { await dmk.disconnect({ sessionId: s.sessionId }); }
