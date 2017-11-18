import {
    DebugSession, Event, InitializedEvent, Logger, logger,
    LoggingDebugSession, Source,
    Thread
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import * as WebSiteModels from '../../node_modules/azure-arm-website/lib/models';

import { KuduLogPointsDebuggerClient } from './logPointsClient';
import { CommandRunResult } from './structs/CommandRunResult';
import { ICloseSessionRequest } from './structs/ICloseSessionRequest';
import { ILoadedScriptsRequest } from './structs/ILoadedScriptsRequest';
import { ILoadedScriptsResponse } from './structs/ILoadedScriptsResponse';
import { ILoadSourceRequest } from './structs/ILoadSourceRequest';
import { IRemoveLogpointRequest } from './structs/IRemoveLogpointRequest';
import { ISetLogpointRequest } from './structs/ISetLogpointRequest';

interface IAttachRequestArguments extends DebugProtocol.AttachRequestArguments {
    trace?: boolean;
    siteName: string;
    publishCredentialUsername: string;
    publishCredentialPassword: string;
    instanceId?: string;
    sessionId: string;
    debugId: string;
}

const logPointsDebuggerClient = new KuduLogPointsDebuggerClient();

// tslint:disable-next-line:export-name
export class NodeDebugSession extends LoggingDebugSession {
    private _sessionId: string;
    private _debugId: string;
    private _siteName: string;
    private _affinityValue: string;
    private _publishingUsername: string;
    private _publishingPassword: string;

    public constructor() {
        super("jsLogPointsdebugadapter.log");

        // uses zero-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        logger.setup(Logger.LogLevel.Verbose, false);

        super.initializeRequest(response, args);
        this.sendEvent(new InitializedEvent());
    }

    protected attachRequest(response: DebugProtocol.AttachResponse, args: IAttachRequestArguments): void {
        this._sessionId = args.sessionId;
        this._debugId = args.debugId;
        this._siteName = args.siteName;
        this._affinityValue = args.instanceId;
        this._publishingUsername = args.publishCredentialUsername;
        this._publishingPassword = args.publishCredentialPassword;

        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = false;

        this.sendResponse(response);
    }

    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        // tslint:disable-next-line:no-unused-expression
        args && 1;
        response.body = {
            breakpoints: []
        };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        // return the default thread
        response.body = {
            threads: [
                new Thread(1, "thread 1")
            ]
        };
        this.sendResponse(response);

        this.getLoadedScripts();
    }

    // tslint:disable-next-line:no-any
    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        if (command === 'loadSource') {
            const sourceId: string = args;
            const request: ILoadSourceRequest = { sessionId: this._sessionId, debugId: this._debugId, sourceId };
            logPointsDebuggerClient.loadSource(this._siteName, this._affinityValue, this.getPublishCrednetial(), request).then(
                (result) => {
                    if (result.isSuccessful()) {
                        response.body = {
                            content: result.json.data
                        };
                    } else {
                        response.body = {
                            error: result.error
                        };
                    }
                    this.sendResponse(response);
                });
        } else if (command === 'setLogpoint') {
            const request: ISetLogpointRequest = {
                sessionId: this._sessionId, debugId: this._debugId, sourceId: args.scriptId,
                lineNumber: args.lineNumber, columNumber: args.columnNumber, expression: args.expression
            };
            logPointsDebuggerClient.setLogpoint(this._siteName, this._affinityValue, this.getPublishCrednetial(), request)
                .then(result => {
                    if (result.isSuccessful()) {
                        response.body = result.json;
                    } else {
                        response.body = {
                            error: result.error
                        };
                    }

                    this.sendResponse(response);
                });

        } else if (command === 'removeLogpoint') {
            const request: IRemoveLogpointRequest = { sessionId: this._sessionId, debugId: this._debugId, logpointId: <string>args };
            logPointsDebuggerClient.removeLogpoint(this._siteName, this._affinityValue, this.getPublishCrednetial(), request)
                .then(result => {
                    logger.log(`removeLogpoint received. ${require('util').inspect(result)}`);
                });
        }
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
        // There is args.terminateDebuggee, which can be potentially utilized. Ignore for now.
        // tslint:disable-next-line:no-unused-expression
        args && 1;
        const request: ICloseSessionRequest = { sessionId: this._sessionId };
        logPointsDebuggerClient.closeSession(this._siteName, this._affinityValue, this.getPublishCrednetial(), request)
            .then(() => {
                // Since the response is just a acknowledgement, the client will not even look at it, so we call sendResponse() regardlesss of the result.
                this.sendResponse(response);
            });
    }

    private async getLoadedScripts(): Promise<void> {
        const request: ILoadedScriptsRequest = { sessionId: this._sessionId, debugId: this._debugId };
        const response: CommandRunResult<ILoadedScriptsResponse>
            = await logPointsDebuggerClient.loadedScripts(this._siteName, this._affinityValue, this.getPublishCrednetial(), request);

        if (response.isSuccessful()) {
            response.json.data.forEach((sourceData) => {
                const source = new Source(sourceData.name, sourceData.path);
                try {
                    source.sourceReference = parseInt(sourceData.sourceId, 10);
                } catch {
                    // if parseInt is not sucessful, then do not set the 'sourceReference' field.
                }

                this.sendEvent(new Event('loadedSource', source));
            });
        }

    }

    private getPublishCrednetial(): WebSiteModels.User {
        return {
            location: undefined,
            publishingUserName: this._publishingUsername,
            publishingPassword: this._publishingPassword
        };
    }
}

DebugSession.run(NodeDebugSession);
