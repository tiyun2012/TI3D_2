
import { TimelineState } from '../../types';

export class TimelineSystem {
    state: TimelineState = {
        currentTime: 0,
        duration: 30,
        isPlaying: false,
        playbackSpeed: 1.0,
        isLooping: true
    };

    get currentTime() { return this.state.currentTime; }
    get duration() { return this.state.duration; }
    get isPlaying() { return this.state.isPlaying; }
    get isLooping() { return this.state.isLooping; }
    set isLooping(v: boolean) { this.state.isLooping = v; }

    play() {
        this.state.isPlaying = true;
    }

    pause() {
        this.state.isPlaying = false;
    }

    stop() {
        this.state.isPlaying = false;
        this.state.currentTime = 0;
    }

    setTime(time: number) {
        this.state.currentTime = Math.max(0, Math.min(time, this.state.duration));
    }

    update(dt: number): boolean {
        if (this.state.isPlaying) {
            this.state.currentTime += dt * this.state.playbackSpeed;
            if (this.state.currentTime >= this.state.duration) {
                if (this.state.isLooping) {
                    this.state.currentTime = 0;
                } else {
                    this.state.currentTime = this.state.duration;
                    this.state.isPlaying = false;
                    return true; // Finished
                }
            }
        }
        return false;
    }
}
