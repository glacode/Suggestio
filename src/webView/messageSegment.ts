export abstract class MessageSegment {
    public element: HTMLDivElement;
    constructor(protected container: HTMLElement, public type: string) {
        this.element = document.createElement('div');
        this.container.appendChild(this.element);
    }
    abstract append(text: string): void;
    abstract update(data: any): void;
}
