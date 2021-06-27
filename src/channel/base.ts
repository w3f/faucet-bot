import { Storage } from "../util/storage";
import { OpUnitType } from "dayjs";

export class ChannelBase {
    constructor(
        protected channelName: string,
        protected storage: Storage
    ) {}

    getCommand (msg: string) {
        return msg.trim().split(" ");
    }
}