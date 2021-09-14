// You might be thinking "WHY THE FUCK WOULD YOU EVER HAVE
// SOMETHING LIKE THIS?"

// well maybe I want to add extensions in real time instead of having
// to force people to go through the typescript compiler just to add some
// basic scripts. it makes it more bearable for sbs peoople at least

export class Hook<T> {
    private name: string
    private description: string
    private author: string
    private code: string
    private callback: Function

    constructor(code: string, name: string="", description: string="",
        author: string="") {
        this.name = name;
        this.description = description;
        this.author = author;
        this.code = code;
        // eslint-disable-next-line no-eval
        this.callback = (parameter: T) => window.eval(code)(parameter)
    }

    public call(parameter: T) {
        this.callback(parameter);
    }
}

export class HookInterface<T> {
    private preHookedEvents: Array<Hook<T>> = [];
    private postHookedEvents: Array<Hook<T>> = [];
    
    public addPreHookEvent(hook: Hook<T>) {
        this.preHookedEvents.push(hook);
    }

    public addPostHookEvent(hook: Hook<T>) {
        this.postHookedEvents.push(hook);
    }

    // calls the hooks before and after executing a callback, with the 
    // obj being the object that is passed to the hooks.
    public callHooks(obj: T, callback: Function): void {
        this.preHookedEvents.forEach(hook => hook.call(obj));
        callback();
        this.postHookedEvents.forEach(hook => hook.call(obj));
    }
}