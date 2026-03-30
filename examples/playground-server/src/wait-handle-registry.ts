/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */


interface WaitHandle {
	resolve: (answer: string) => void;
	reject: (err: Error) => void;
	question: string;
	registeredAt: number;
}

class WaitHandleRegistry {
	private readonly handles = new Map<string, WaitHandle>();

	register(sessionId: string, question: string): Promise<string> {
		this.cancel(sessionId);

		return new Promise<string>((resolve, reject) => {
			this.handles.set(sessionId, {
				resolve,
				reject,
				question,
				registeredAt: Date.now(),
			});
		});
	}

	respond(sessionId: string, answer: string): boolean {
		const handle = this.handles.get(sessionId);
		if (!handle) return false;
		this.handles.delete(sessionId);
		handle.resolve(answer);
		return true;
	}

	cancel(sessionId: string): void {
		const handle = this.handles.get(sessionId);
		if (handle) {
			this.handles.delete(sessionId);
			handle.reject(new Error("Wait handle superseded by a new registration"));
		}
	}

	hasPending(sessionId: string): boolean {
		return this.handles.has(sessionId);
	}
}

export const waitHandleRegistry = new WaitHandleRegistry();
