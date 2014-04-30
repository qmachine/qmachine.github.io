// https://ghpages.qmachine.org/q.js

//- JavaScript source code

//- quanah.js ~~
//                                                      ~~ (c) SRW, 14 Nov 2012
//                                                  ~~ last updated 17 Dec 2013

(function (global) {
    'use strict';

 // Pragmas

    /*jshint es3: true, maxparams: 1, quotmark: single, strict: true */

    /*jslint indent: 4, maxlen: 80 */

    /*properties
        add_to_queue, apply, avar, call, can_run_remotely, comm, concat, def,
        done, epitaph, exit, exports, f, fail, hasOwnProperty, key, length, on,
        onerror, prototype, push, Q, QUANAH, queue, random, ready, revive,
        run_remotely, shift, slice, stay, sync, toString, unshift, val,
        valueOf, x
    */

 // Prerequisites

    if (global.hasOwnProperty('QUANAH')) {
     // Exit early if Quanah's "namespace" is already present. Unfortunately,
     // it may not always exist as a global variable, so we'll probably need to
     // search through `module.exports` in the future ...
        return;
    }

 // Declarations

    var AVar, avar, can_run_remotely, def, is_Function, queue, revive,
        run_locally, run_remotely, sync, user_defs, uuid;

 // Definitions

    AVar = function AVar(obj) {
     // This function constructs "avars", which are generic containers for
     // "asynchronous variables".
        var key, state, that;
        state = {'epitaph': null, 'onerror': null, 'queue': [], 'ready': true};
        that = this;
        for (key in obj) {
            if ((obj.hasOwnProperty(key)) && (key !== 'comm')) {
                that[key] = obj[key];
            }
        }
        that.comm = function comm(obj) {
         // This function provides a mechanism for manipulating the internal
         // state of an avar without providing direct access to that state. It
         // was inspired by the message-passing style used in Objective-C.
            var args, key, message;
            for (key in obj) {
                if (obj.hasOwnProperty(key)) {
                    args = [].concat(obj[key]);
                    message = key;
                }
            }
            switch (message) {
            case 'add_to_queue':
             // The next transformation to be applied to this avar will be put
             // into an instance-specific queue before it ends up in the main
             // task queue (`queue`). Because retriggering execution by sending
             // `done` messages recursively requires a lot of extra overhead,
             // we'll just go ahead and retrigger execution directly.
                if (is_Function(args[0])) {
                    state.queue.push(args[0]);
                    if (state.ready === true) {
                        state.ready = false;
                        queue.unshift({'f': state.queue.shift(), 'x': that});
                    }
                } else if (args[0] instanceof AVar) {
                    sync(args[0], that).Q(function (evt) {
                     // This function allows Quanah to postpone execution of
                     // the given task until both `f` and `x` are ready. The
                     // following line is given in the form `f.call(x, evt)`.
                        (args[0].val).call(that, evt);
                        return;
                    });
                } else {
                    comm({'fail': 'Transformation must be a function.'});
                }
                break;
            case 'done':
             // A computation involving this avar has succeeded, and we will
             // now prepare to run the next computation that depends on it by
             // transferring it from the avar's individual queue into the
             // global `queue` used by the `revive` function.
                state.ready = true;
                if (state.queue.length > 0) {
                    state.ready = false;
                    queue.unshift({'f': state.queue.shift(), 'x': that});
                }
                break;
            case 'fail':
             // A computation involving this avar has failed, and we will now
             // suspend all computations that depend on it indefinitely by
             // overwriting the queue with a fresh one. This is also important
             // because the garbage collector can't free the memory unless we
             // release these references. We will also try to call `onerror`
             // if one has been defined.
                if (state.epitaph === null) {
                 // We don't want to overwrite the original error by accident,
                 // since that would be an utter nightmare for debugging.
                    state.epitaph = args;
                }
                state.queue = [];
                state.ready = false;
                if (is_Function(state.onerror)) {
                    state.onerror.apply(that, state.epitaph);
                }
                break;
            case 'on':
             // This one is an experiment ...
                if ((args[0] === 'error') && (is_Function(args[1]))) {
                 // A computation has defined an `onerror` handler for this
                 // avar, but we need to make sure that it hasn't already
                 // failed in some previous computation. If the avar has
                 // already failed, we will store the handler and also fire it
                 // immediately.
                    state.onerror = args[1];
                    if (state.epitaph !== null) {
                        comm({'fail': state.epitaph});
                    }
                }
                break;
            case 'stay':
             // A computation that depends on this avar has been postponed,
             // but that computation will be put back into the queue directly
             // by `local_call`. Thus, nothing actually needs to happen here;
             // we just need to wait. For consistency with `exit` and `fail`,
             // I allow `stay` to take a message argument, but right now it
             // doesn't actually do anything. In the future, however, I may
             // enable a verbose mode for debugging that outputs the message.
                break;
            default:
             // When this arm is chosen, either an error exists in Quanah or
             // else a user is re-programming Quanah's guts; in either case, it
             // may be useful to capture the error. Another possibility is that
             // a user is trying to trigger `revive` using an obsolete idiom
             // that involved calling `comm` without any arguments.
                comm({'fail': 'Invalid `comm` message "' + message + '"'});
            }
            return revive();
        };
        if (that.hasOwnProperty('key') === false) {
            that.key = uuid();
        }
        if (that.hasOwnProperty('val') === false) {
            that.val = null;
        }
     // At this point, we will never use `key` or `obj` again, and the `comm`
     // instance method shadows those names, but I'm not sure if we need to
     // destroy the references ourselves explicitly for garbage collection ...
        return that;
    };

    avar = function (obj) {
     // This function enables the user to avoid the `new` keyword, which is
     // useful because OOP in JS is not typically well-understood by users.
        return new AVar(obj);
    };

    can_run_remotely = function (task) {
     // This function exists to keep the abstraction in `revive` as clean and
     // close to English as possible. It tests for the existence of particular
     // user-defined functions so that `revive` can decide whether to use local
     // or remote execution for a given task.
        return ((is_Function(user_defs.can_run_remotely))   &&
                (is_Function(user_defs.run_remotely))       &&
                (user_defs.can_run_remotely(task)));
    };

    def = function (obj) {
     // This function enables the user to redefine "internal" functions from
     // outside the giant anonymous closure. In particular, this allows users
     // to "port" Quanah as a concurrency model for use with almost any storage
     // or messaging system.
        var key;
        for (key in obj) {
            if ((obj.hasOwnProperty(key)) && (user_defs[key] === null)) {
                user_defs[key] = obj[key];
            }
        }
        return;
    };

    is_Function = function (f) {
     // This function returns `true` only if and only if the input argument
     // `f` is a function. The second condition is necessary to avoid a false
     // positive when `f` is a regular expression. Please note that an avar
     // whose `val` property is a function will still return `false`.
        return ((typeof f === 'function') && (f instanceof Function));
    };

    queue = [];

    revive = function () {
     // This function contains the execution center for Quanah. It's pretty
     // simple, really -- it just runs the first available task in its queue
     // (`queue`) in an execution context appropriate for that particular task.
     // That's all it does. It makes no attempt to run every task in the queue
     // every time it is called, because instead it assumes it will be called
     // repeatedly until the entire program has executed. For example, every
     // time an avar receives a `comm` message, `revive` will run. Because
     // `revive` only runs a single task from its queue for each invocation,
     // that queue can be shared safely across multiple execution contexts
     // simultaneously, and it makes no difference if the separate contexts are
     // due to recursion or to special objects such as Web Workers. The
     // `revive` function selects an execution context using conditional tests
     // that determine whether a given task can be distributed faithfully to
     // external resources for execution or not; if a task cannot be
     // distributed faithfully, then it will be executed by the local machine.
        var task = queue.shift();
        if (task !== undefined) {
            if (can_run_remotely(task)) {
                run_remotely(task);
            } else {
                run_locally(task);
            }
        }
        return;
    };

    run_locally = function (obj) {
     // This function applies the transformation `f` to `x` for method `f` and
     // property `x` of the input object `obj` by calling `f` with `evt` as an
     // input argument and `x` as the `this` value. The advantage of performing
     // transformations this way versus computing `f(x)` directly is that it
     // allows the user to indicate the program's logic explicitly even when
     // the program's control is difficult or impossible to predict, as is
     // commonly the case in JavaScript when working with callback functions.
        var evt;
        try {
            evt = {
             // This is the `evt` object, an object literal with methods that
             // send messages to `obj.x` for execution control. Methods can
             // be replaced by the user from within the calling function `f`
             // without affecting the execution of computations :-)
                'exit': function (message) {
                 // This function indicates successful completion.
                    return obj.x.comm({'done': message});
                },
                'fail': function (message) {
                 // This function indicates a failure, and it is intended to
                 // replace the `throw new Error(...)` idiom, primarily because
                 // capturing errors that are thrown during remote execution
                 // are very difficult to capture and return to the invoking
                 // contexts otherwise. Although `local_call` is named "local"
                 // to indicate that the invocation and execution occur on the
                 // same machine, the `volunteer` function actually imports
                 // tasks from other machines before invoking and executing
                 // them; therefore, the "original invocation" may have come
                 // from a "remote" machine, with respect to execution. Thus,
                 // Quanah encourages users to replace `throw` with `fail` in
                 // their programs to solve the remote error capture problem.
                    return obj.x.comm({'fail': message});
                },
                'stay': function (message) {
                 // This function allows a user to postpone execution, and it
                 // is particularly useful for delaying execution until some
                 // condition is met -- it can be used to write non-blocking
                 // `while` and `until` constructs, for example. Since the
                 // ECMAScript standard lacks anything resembling a package
                 // manager, the `stay` method also comes in handy for delaying
                 // execution until an external library has loaded. Of course,
                 // if you delay the execution, when will it run again? The
                 // short answer is unsatisfying: you can never _know_. For a
                 // longer answer, you'll have to wait for my upcoming papers
                 // that explain why leaving execution guarantees to chance is
                 // perfectly acceptable when the probability approachs 1 :-)
                 //
                 // NOTE: Don't push back onto the queue until _after_ you send
                 // the `stay` message. Invoking `comm` also invokes `revive`,
                 // which consequently exhausts the recursion stack depth limit
                 // immediately if there's only one task to be run.
                    obj.x.comm({'stay': message});
                    queue.push(obj);
                    return;
                }
            };
         // After all the setup, the actual invocation is anticlimactic ;-)
            obj.f.call(obj.x, evt);
        } catch (err) {
         // In early versions of Quanah, `stay` threw a special Error type as
         // a crude form of message passing, but because it no longer throws
         // errors, we can assume that all caught errors are failures. Because
         // the user may have chosen to replace the `evt.fail` method with a
         // personal routine, I have deliberately reused that reference here,
         // to honor the user's wishes.
            evt.fail(err);
        }
        return;
    };

    run_remotely = function (task) {
     // This function exists only to forward input arguments to a user-defined
     // function which may or may not ever be provided. JS doesn't crash in a
     // situation like this because `can_run_remotely` tests for the existence
     // of the user-defined method before delegating to `run_remotely`.
        user_defs.run_remotely(task);
        return;
    };

    sync = function () {
     // This function takes any number of arguments, any number of which may
     // be avars, and it outputs a new avar which acts as a "sync point". The
     // syntax here is designed to mimic `Array.concat`. The avar returned by
     // this function will have a slightly modified form of `AVar.prototype.Q`
     // placed directly onto it as an instance method as means to provide a
     // nice way of distinguishing a "normal" avar from a "sync point". Any
     // functions that are fed into the `Q` method will wait for all input
     // arguments' outstanding queues to empty before executing, and exiting
     // will allow each of the inputs to begin working through its individual
     // queue again. Also, a sync point can still be used as a prerequisite to
     // execution even when the sync point depends on one of the other
     // prerequisites. (Although the immediate usefulness of this capability
     // isn't obvious, it turns out to be crucially important for expressing
     // certain concurrency patterns idiomatically.)
     //
     // NOTE: What happens here if an avar which has already failed is used in
     // a `sync` statement? Does the `sync` fail immediately, as expected?
     //
     // NOTE: The instance method `Q` that gets added to a sync point is not
     // a perfect substitute for the instance `comm` method it already has ...
     //
        var args, flag, i, stack, temp, x, y;
        args = Array.prototype.slice.call(arguments);
        stack = args.slice();
        x = [];
        y = avar();
        while (stack.length > 0) {
         // This `while` loop replaces the previous `union` function, which
         // called itself recursively to create an array `x` of unique
         // dependencies from the input arguments `args`. Instead, I am using
         // an array-based stack here with a `while` loop as a means to avoid
         // the treacherous function recursion stack and its unpredictably
         // limited depth, since a user could potentially write fiendishly
         // complicated code that would actually overflow that limit. Anyway,
         // the prerequisites of compound avars will be added, but the compound
         // avars themselves will not be added. Performing this operation is
         // what allows Quanah to "un-nest" `sync` statements in a single pass
         // without constructing a directed acyclic graph or preprocessing the
         // source code :-)
            temp = stack.shift();
            if ((temp instanceof AVar) && (temp.hasOwnProperty('Q'))) {
             // This arm "flattens" dependencies for array-based recursion.
                Array.prototype.push.apply(stack, temp.val);
            } else {
             // This arm ensures that elements are unique.
                flag = false;
                for (i = 0; (flag === false) && (i < x.length); i += 1) {
                    flag = (temp === x[i]);
                }
                if (flag === false) {
                    x.push(temp);
                }
            }
        }
        y.Q = function (f) {
         // This function is an instance-specific "Method Q".
            if (f instanceof AVar) {
                y.comm({'add_to_queue': f});
                return y;
            }
            var blocker, count, egress, i, m, n, ready;
            blocker = function (evt) {
             // This function stores the `evt` argument into an array so we can
             // prevent further execution involving `val` until after we call
             // the input argument `f`.
                egress.push(evt);
                return count();
            };
            count = function () {
             // This function is a simple counting semaphore that closes over
             // some private state variables in order to delay the execution of
             // `f` until certain conditions are satisfied.
                m += 1;
                if (m === n) {
                    ready = true;
                }
                return revive();
            };
            egress = [];
            m = 0;
            n = x.length;
            ready = false;
            for (i = 0; i < n; i += 1) {
                if (x[i] instanceof AVar) {
                    x[i].Q(blocker);
                } else {
                    count();
                }
            }
            y.comm({'add_to_queue': function (evt) {
             // This function uses closure over private state variables and the
             // input argument `f` to delay execution and to run `f` with a
             // modified version of the `evt` argument it will receive. This
             // function will be put into `y`'s queue, but it will not run
             // until `ready` is `true`.
                if (ready === false) {
                    return evt.stay('Acquiring "lock" ...');
                }
                f.call(this, {
                 // These methods close over the `evt` argument as well as
                 // the `egress` array so that invocations of the control
                 // statements `exit`, `fail`, and `stay` are forwarded to
                 // all of the original arguments given to `sync`.
                    'exit': function (message) {
                     // This function signals successful completion :-)
                        var i, n;
                        for (i = 0, n = egress.length; i < n; i += 1) {
                            egress[i].exit(message);
                        }
                        return evt.exit(message);
                    },
                    'fail': function (message) {
                     // This function signals a failed execution :-(
                        var i, n;
                        for (i = 0, n = egress.length; i < n; i += 1) {
                            egress[i].fail(message);
                        }
                        return evt.fail(message);
                    },
                    'stay': function (message) {
                     // This function postpones execution temporarily.
                        var i, n;
                        for (i = 0, n = egress.length; i < n; i += 1) {
                            egress[i].stay(message);
                        }
                        return evt.stay(message);
                    }
                });
                return;
            }});
            return y;
        };
        return y;
    };

    user_defs = {'can_run_remotely': null, 'run_remotely': null};

    uuid = function () {
     // This function generates random hexadecimal strings of length 32. These
     // strings don't satisfy RFC 4122 or anything, but they're conceptually
     // the same as UUIDs.
        var y = Math.random().toString(16).slice(2, 32);
        if (y === '') {
         // This shouldn't ever happen in JavaScript, but Adobe/Mozilla Tamarin
         // has some weird quirks due to its ActionScript roots.
            while (y.length < 32) {
                y += (Math.random() * 1e16).toString(16);
            }
            y = y.slice(0, 32);
        } else {
         // Every other JS implementation I have tried will use this instead.
            while (y.length < 32) {
                y += Math.random().toString(16).slice(2, 34 - y.length);
            }
        }
        return y;
    };

 // Prototype definitions

    AVar.prototype.on = function () {
     // This function's only current use is to allow users to set custom error
     // handlers, but by mimicking the same idiom used by jQuery and Node.js, I
     // am hoping to leave myself plenty of room to grow later :-)
        this.comm({'on': Array.prototype.slice.call(arguments)});
        return this;
    };

    AVar.prototype.Q = function method_Q(f) {
     // This function is the infamous "Method Q" that acted as a "namespace"
     // for previous versions of Quanah. Here, it is defined as a prototype
     // method for avars, but if you assign it to `Object.prototype.Q`, it will
     // work for any native value except `null` or `undefined`. It expects its
     // argument to be a function of a single variable or else an avar with
     // such a function as its `val`.
        if (AVar.prototype.Q !== method_Q) {
            throw new Error('`AVar.prototype.Q` may have been compromised.');
        }
        var x = (this instanceof AVar) ? this : avar({'val': this});
        x.comm({'add_to_queue': f});
        return x;
    };

    AVar.prototype.revive = function () {
     // This function is a chainable syntactic sugar for triggering `revive`
     // from code external to this giant anonymous closure.
        revive();
        return this;
    };

    AVar.prototype.toString = function () {
     // This function delegates to the avar's `val` property if possible. The
     // code here differs from the code for `AVar.prototype.valueOf` because it
     // assumes that the returned value should have a particular type (string).
     // My reasoning here is that, if the returned value were not a string, the
     // JS engine will coerce it to a string; for the `null` and `undefined`
     // cases, we can circumvent that coercion and thereby improve performance.
        if (this.val === null) {
            return 'null';
        }
        if (this.val === undefined) {
            return 'undefined';
        }
        return this.val.toString.apply(this.val, arguments);
    };

    AVar.prototype.valueOf = function () {
     // This function delegates to the avar's `val` property. It would be easy
     // simply to return the value of the avar's `val` and let the JS engine
     // decide what to do with it, but that approach assumes that no value's
     // `valueOf` method ever uses input arguments. That assumption could be
     // supported by a careful reading of the ES5.1 standard (June 2011), but
     // the priority here is correctness -- not performance -- and therefore
     // this method has been designed for generic use.
        if ((this.val === null) || (this.val === undefined)) {
            return this.val;
        }
        return this.val.valueOf.apply(this.val, arguments);
    };

 // Out-of-scope definitions

    (function (obj) {
     // This function runs in Node.js, PhantomJS, and RingoJS, which means it
     // may work with other CommonJS-ish package loaders, too. I am not certain
     // whether this function adds much value, however, because the mere act of
     // loading Quanah loads "Method Q" anyway ...
        /*jslint node: true */
        if (typeof module === 'object') {
            module.exports = obj;
        } else {
            global.QUANAH = obj;
        }
        return;
    }({'avar': avar, 'def': def, 'sync': sync}));

 // That's all, folks!

    return;

}(Function.prototype.call.call(function (that) {
    'use strict';

 // This strict anonymous closure encapsulates the logic for detecting which
 // object in the environment should be treated as _the_ global object. It's
 // not as easy as you may think -- strict mode disables the `call` method's
 // default behavior of replacing `null` with the global object. Luckily, we
 // can work around that by passing a reference to the enclosing scope as an
 // argument at the same time and testing to see if strict mode has done its
 // deed. This task is not hard in the usual browser context because we know
 // that the global object is `window`, but CommonJS implementations such as
 // RingoJS confound the issue by modifying the scope chain, running scripts
 // in sandboxed contexts, and using identifiers like `global` carelessly ...

    /*jslint indent: 4, maxlen: 80 */
    /*global global: false */
    /*properties global */

    if (this === null) {

     // Strict mode has captured us, but we already passed a reference :-)

        return (typeof global === 'object') ? global : that;

    }

 // Strict mode isn't supported in this environment, but we need to make sure
 // we don't get fooled by Rhino's `global` function.

    return (typeof this.global === 'object') ? this.global : this;

}, null, this)));

//- vim:set syntax=javascript:
//- JavaScript source code

//- qmachine.js ~~
//                                                      ~~ (c) SRW, 15 Nov 2012
//                                                  ~~ last updated 02 Feb 2014

(function (global, sandbox) {
    'use strict';

 // Pragmas

    /*jshint maxparams: 5, quotmark: single, strict: true */

    /*jslint indent: 4, maxlen: 80 */

    /*properties
        a, ActiveXObject, addEventListener, adsafe, anon, appendChild, apply,
        atob, attachEvent, avar, b, bitwise, body, box, browser, btoa, by,
        call, can_run_remotely, cap, charAt, charCodeAt, CoffeeScript, comm,
        configurable, console, constructor, contentWindow, continue,
        createElement, css, data, debug, def, '__defineGetter__',
        defineProperty, '__defineSetter__', detachEvent, devel, diagnostics,
        display, document, done, enumerable, env, epitaph, eqeq, error, errors,
        es5, eval, evil, exemptions, exit, f, fail, floor, forin, fragment,
        fromCharCode, get, getElementsByTagName, global, hasOwnProperty, head,
        host, ignoreCase, importScripts, indexOf, join, JSLINT, key, length,
        lib, load_data, load_script, location, log, map, mapreduce, method,
        multiline, navigator, newcap, node, nomen, now, on, onLine, onload,
        onreadystatechange, open, parentElement, parse, passfail, plusplus,
        ply, postMessage, predef, properties, protocol, prototype, push, puts,
        Q, QM, QUANAH, query, random, readyState, reason, recent, reduce,
        regexp, removeChild, removeEventListener, replace, responseText,
        result, results, revive, rhino, run_remotely, safe, send, set,
        setRequestHeader, setTimeout, shelf, shift, slice, sloppy, source, src,
        status, stay, stringify, stupid, style, sub, submit, sync, test, time,
        toJSON, toSource, toString, todo, undef, unparam, url, val, value,
        valueOf, vars, via, visibility, volunteer, white, window, windows,
        withCredentials, writable, x, XDomainRequest, XMLHttpRequest, y
    */

 // Prerequisites

    if (global.hasOwnProperty('QM')) {
     // Exit early if QMachine is already present.
        return;
    }

    if (global.hasOwnProperty('QUANAH') === false) {
     // This checks to make sure that Quanah 0.2.0 or later has been loaded.
        throw new Error('Quanah is missing.');
    }

 // Declarations

    var ajax, atob, AVar, avar, btoa, can_run_remotely, convert_to_js, copy,
        deserialize, defineProperty, in_a_browser, in_a_WebWorker, is_closed,
        is_online, is_Function, is_RegExp, is_String, jobs, lib, load_data,
        load_script, map, mapreduce, mothership, origin, ply, puts, read,
        recent, reduce, revive, run_remotely, serialize, state, submit, sync,
        update_local, update_remote, volunteer, write;

 // Definitions

    ajax = function (method, url, body) {
     // This function returns an avar.
        var y = avar();
        y.Q(function (evt) {
         // This function needs documentation of a more general form ...
            if ((body !== undefined) && (body.length > 1048576)) {
             // If it's certain to fail, why not just fail preemptively?
                return evt.fail('Upload size is too large.');
            }
            if (recent(method, url)) {
             // If we have already issued this request recently, we need to
             // wait a minute before doing it again to avoid hammering the
             // server needlessly.
                return evt.stay('Enforcing refractory period ...');
            }
            var request;
         // As of Chrome 21 (and maybe sooner than that), Web Workers do have
         // the `XMLHttpRequest` constructor, but it isn't one of `global`'s
         // own properties as it is in Firefox 15.01 or Safari 6. In Safari 6,
         // however, `XMLHttpRequest` has type 'object' rather than 'function',
         // which makes _zero_ sense to me right now. Thus, my test is _not_
         // intuitive in the slightest ...
            if (global.XMLHttpRequest instanceof Object) {
                request = new global.XMLHttpRequest();
                if (origin() !== mothership) {
                 // This is a slightly weaker test than using `hasOwnProperty`,
                 // but it may work better with Firefox. I'll test in a minute.
                    if (request.withCredentials === undefined) {
                        if (global.hasOwnProperty('XDomainRequest')) {
                            request = new global.XDomainRequest();
                        } else {
                            return evt.fail('Browser does not support CORS.');
                        }
                    }
                }
            } else if (global.hasOwnProperty('ActiveXObject')) {
                request = new global.ActiveXObject('Microsoft.XMLHTTP');
            } else {
                return evt.fail('Browser does not support AJAX.');
            }
            request.onreadystatechange = function () {
             // This function needs documentation.
                if (request.readyState === 4) {
                    if (request.status >= 500) {
                     // These are internal server errors that were occurring
                     // in early "full-stack" versions of QMachine due to a
                     // small error in a Monit script. I've left this arm in
                     // here just in case something silly like that happens
                     // again so that the client keeps trying to connect if
                     // the error is due to a temporary snag on the server.
                        return evt.stay('Internal server error?');
                    }
                    y.val = request.responseText;
                    if (((method === 'GET') && (request.status !== 200)) ||
                            ((method === 'POST') && (request.status !== 201))) {
                     // Something else went wrong, and we can't ignore it.
                        return evt.fail(request.status);
                    }
                    return evt.exit();
                }
             // NOTE: Should we `revive` here?
                return;
            };
            request.open(method, url, true);
            if (method === 'POST') {
             // This code only ever runs as part of an API call. As of v0.9.11,
             // my Node.js server does not check for this header, but some
             // frameworks like Express (http://expressjs.com) that parse the
             // body of the incoming request automatically *do* care. In my
             // testing, it hasn't messed up CORS or anything, but if things
             // suddenly stop working, this is going to be my first suspect!
                request.setRequestHeader('Content-Type', 'application/json');
            }
            request.send(body);
            return;
        });
        return y;
    };

    atob = function (x) {
     // This function redefines itself during its first invocation.
        if (is_Function(global.atob)) {
            atob = global.atob;
        } else {
            atob = function (x) {
             // This function decodes a string which has been encoded using
             // base64 encoding. It isn't part of JavaScript or any standard,
             // but it _is_ a DOM Level 0 method, and it is extremely useful
             // to have around. Unfortunately, it isn't available in Node.js,
             // the Web Worker contexts of Chrome 21 or Safari 6, or common
             // server-side developer shells like Spidermonkey, D8 / V8, or
             // JavaScriptCore.
                /*jslint bitwise: true */
                var a, ch1, ch2, ch3, en1, en2, en3, en4, i, n, y;
                n = x.length;
                y = '';
                if (n > 0) {
                    a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg' +
                        'hijklmnopqrstuvwxyz0123456789+/=';
                 // NOTE: This `for` loop may actually require sequentiality
                 // as currently written. I converted it from a `do..while`
                 // implementation, but I will write it as a `map` soon :-)
                    for (i = 0; i < n; i += 4) {
                     // Surprisingly, my own tests have shown that it is faster
                     // to use the `charAt` method than to use array indices,
                     // as of 19 Aug 2012. I _do_ know that `charAt` has better
                     // support in old browsers, but the speed surprised me.
                        en1 = a.indexOf(x.charAt(i));
                        en2 = a.indexOf(x.charAt(i + 1));
                        en3 = a.indexOf(x.charAt(i + 2));
                        en4 = a.indexOf(x.charAt(i + 3));
                        if ((en1 < 0) || (en2 < 0) || (en3 < 0) || (en4 < 0)) {
                         // It also surprised me to find out that testing for
                         // invalid characters inside the loop is faster than
                         // validating with a regular expression beforehand.
                            throw new Error('Invalid base64 characters: ' + x);
                        }
                        ch1 = ((en1 << 2) | (en2 >> 4));
                        ch2 = (((en2 & 15) << 4) | (en3 >> 2));
                        ch3 = (((en3 & 3) << 6) | en4);
                        y += String.fromCharCode(ch1);
                        if (en3 !== 64) {
                            y += String.fromCharCode(ch2);
                        }
                        if (en4 !== 64) {
                            y += String.fromCharCode(ch3);
                        }
                    }
                }
                return y;
            };
        }
        return atob(x);
    };

    AVar = global.QUANAH.avar().constructor;

    avar = global.QUANAH.avar;

    btoa = function (x) {
     // This function redefines itself during its first invocation.
        if (is_Function(global.btoa)) {
            btoa = global.btoa;
        } else {
            btoa = function (x) {
             // This function encodes binary data into a base64 string. It
             // isn't part of JavaScript or any standard, but it _is_ a DOM
             // Level 0 method, and it is extremely useful to have around.
             // Unfortunately, it isn't available in Node.js, the Web Worker
             // contexts of Chrome 21 or Safari 6, or common server-side
             // developer shells like Spidermonkey, D8 / V8, or JavaScriptCore.
             // Also, it throws an error in most (?) browsers if you feed it
             // Unicode (see http://goo.gl/3fLFs).
                /*jslint bitwise: true */
                var a, ch1, ch2, ch3, en1, en2, en3, en4, i, n, y;
                n = x.length;
                y = '';
                if (n > 0) {
                    a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg' +
                        'hijklmnopqrstuvwxyz0123456789+/=';
                 // NOTE: This `for` loop may actually require sequentiality
                 // as currently written. I converted it from a `do..while`
                 // implementation, but I will write it as a `map` soon :-)
                    for (i = 0; i < n; i += 3) {
                        ch1 = x.charCodeAt(i);
                        ch2 = x.charCodeAt(i + 1);
                        ch3 = x.charCodeAt(i + 2);
                        en1 = (ch1 >> 2);
                        en2 = (((ch1 & 3) << 4) | (ch2 >> 4));
                        en3 = (((ch2 & 15) << 2) | (ch3 >> 6));
                        en4 = (ch3 & 63);
                        if (isNaN(ch2)) {
                            en3 = en4 = 64;
                        } else if (isNaN(ch3)) {
                            en4 = 64;
                        }
                        y += (a.charAt(en1) + a.charAt(en2) + a.charAt(en3) +
                            a.charAt(en4));
                    }
                }
                return y;
            };
        }
        return btoa(x);
    };

    can_run_remotely = function (task) {
     // This function returns a boolean.
        return ((global.hasOwnProperty('JSON'))     &&
                (global.hasOwnProperty('JSLINT'))   &&
                (task instanceof Object)            &&
                (task.hasOwnProperty('f'))          &&
                (task.hasOwnProperty('x'))          &&
                (is_Function(task.f))               &&
                (task.x instanceof AVar)            &&
                (is_online())                       &&
                (is_closed(task, state.exemptions[task.x.key]) === false));
    };

    convert_to_js = function (x) {
     // This function converts a function or string into an avar with a `val`
     // property that is a JavaScript function. This isn't quite the same as an
     // `eval`, however, because the string is expected to be used only when it
     // represents CoffeeScript code. Unfortunately, the mere use of the word
     // so irritates JSLint that I must designate this function "evil" just to
     // suppress its scary messages.
        /*jslint evil: true */
        var y = avar();
        y.Q(function (evt) {
         // This function needs documentation.
            if (is_Function(x)) {
                y.val = x;
                return evt.exit();
            }
            if (is_String(x) === false) {
                return evt.fail('Cannot convert argument to a function');
            }
            if (global.hasOwnProperty('CoffeeScript')) {
                y.val = global.CoffeeScript['eval'](x);
                return evt.exit();
            }
            lib('https://ghpages.qmachine.org/coffeescript.js').Q(function (lib_evt) {
             // This function needs documentation.
                y.val = global.CoffeeScript['eval'](x);
                lib_evt.exit();
                return evt.exit();
            }).on('error', evt.fail);
            return;
        });
        return y;
    };

    copy = function (x, y) {
     // This function copies the properties of `x` to `y`, specifying `y` as
     // object literal if it was not provided as an input argument. It does
     // not perform a "deep copy", which means that properties whose values
     // are objects will be "copied by reference" rather than by value. Right
     // now, I see no reason to worry about deep copies or getters / setters.
     // Because the current version of Quanah no longer uses ECMAScript 5.1
     // features to make the `comm` method non-enumerable, however, we do have
     // to be careful not to overwrite the `y.comm` method if `y` is an avar.
        if (y === undefined) {
         // At one point, I used a test here that `arguments.length === 1`,
         // but it offended JSLint:
         //     "Do not mutate parameter 'y' when using 'arguments'."
            y = {};
        }
        var comm, key;
        if (y instanceof AVar) {
            comm = y.comm;
        }
        for (key in x) {
            if (x.hasOwnProperty(key)) {
                y[key] = x[key];
            }
        }
        if (is_Function(comm)) {
            y.comm = comm;
        }
        return y;
    };

    defineProperty = function (obj, name, params) {
     // This function wraps the ES5 `Object.defineProperty` function so that
     // it degrades gracefully in crusty old browsers. I would like to improve
     // my implementation eventually so that the fallback definition will more
     // closely simulate the ES5 specification, but for now, this works well.
     // For more information, see the documentation at http://goo.gl/xXHKr.
        if (Object.hasOwnProperty('defineProperty')) {
            defineProperty = Object.defineProperty;
        } else if (Object.prototype.hasOwnProperty('__defineGetter__')) {
            defineProperty = function (obj, name, params) {
             // This function needs documentation.
                /*jslint nomen: true */
                params = (params instanceof Object) ? params : {};
                ply(params).by(function (key, val) {
                 // This has a "forEach" pattern ==> `ply` is justified.
                    if (key === 'get') {
                        obj.__defineGetter__(name, val);
                    } else if (key === 'set') {
                        obj.__defineSetter__(name, val);
                    } else if (key === 'value') {
                     // NOTE: This may fail if the property's `configurable`
                     // attribute was set to `false`, but if such an error
                     // could occur, that JS implementation would have had a
                     // native `Object.defineProperty` method anyway :-P
                        delete obj[name];
                        obj[name] = val;
                    }
                    return;
                });
                return obj;
            };
        } else {
            throw new Error('Platform lacks support for getters and setters.');
        }
        return defineProperty(obj, name, params);
    };

    deserialize = function ($x) {
     // This function is a JSON-based deserialization utility that can invert
     // the `serialize` function provided herein. Unfortunately, no `fromJSON`
     // equivalent exists for obvious reasons -- it would have to be a String
     // prototype method, and it would have to be extensible for all types.
     // NOTE: This definition could stand to be optimized, but I recommend
     // leaving it as-is until improving performance is absolutely critical.
        /*jslint unparam: true */
        return JSON.parse($x, function reviver(key, val) {
         // This function is provided to `JSON.parse` as the optional second
         // parameter that its documentation refers to as a `reviver` function.
         // NOTE: This is _not_ the same as Quanah's `revive`!
            var f, re;
            re = /^\[(FUNCTION|REGEXP) ([A-z0-9\+\/\=]+) ([A-z0-9\+\/\=]+)\]$/;
         // Is the second condition even reachable in the line below?
            if (is_String(val)) {
                if (re.test(val)) {
                    val.replace(re, function ($0, type, code, props) {
                     // This function is provided to the String prototype's
                     // `replace` method and uses references to the enclosing
                     // scope to return results. I wrote things this way in
                     // order to avoid changing the type of `val` and thereby
                     // confusing the JIT compilers, but I'm not certain that
                     // using nested closures is any faster anyway. For that
                     // matter, calling the regular expression twice may be
                     // slower than calling it once and processing its output
                     // conditionally, and that way might be clearer, too ...
                        f = sandbox(atob(code));
                        copy(deserialize(atob(props)), f);
                        return;
                    });
                }
            }
            return (f !== undefined) ? f : val;
        });
    };

    in_a_browser = function () {
     // This function returns a boolean.
        return ((global.hasOwnProperty('location'))             &&
                (global.hasOwnProperty('navigator'))            &&
                (global.hasOwnProperty('phantom') === false)    &&
                (global.hasOwnProperty('system') === false));
    };

    in_a_WebWorker = function () {
     // This function returns a boolean.
        return ((is_Function(global.importScripts))             &&
                (global.location instanceof Object)             &&
                (global.navigator instanceof Object)            &&
                (global.hasOwnProperty('phantom') === false)    &&
                (global.hasOwnProperty('system') === false));
    };

    is_closed = function (x, options) {
     // This function tests an input argument `x` for references that "close"
     // over external references from another scope. This function solves a
     // very important problem in JavaScript because function serialization is
     // extremely difficult to perform rigorously. Most programmers consider a
     // function only as its source code representation, but because it is also
     // a closure and JavaScript has lexical scope, the exact "place" in the
     // code where the code existed is important, too. A third consideration is
     // that a function is also an object which can have methods and properties
     // of its own, and these need to be included in the serializated form. I
     // puzzled over this problem and eventually concluded that because I may
     // not be able to serialize an entire scope (I haven't solved that yet), I
     // _can_ get the source code representation of a function from within most
     // JavaScript implementations even though it isn't part of the ECMAScript
     // standard (June 2011). Thus, if a static analysis tool were able to
     // parse the source code representation to confirm that the function did
     // not depend on its scope, then I might be able to serialize it, provided
     // that it did not contain any methods that depended on their scopes. Of
     // course, writing such a tool is a huge undertaking, so instead I just
     // used a fantastic program by Douglas Crockford, JSLINT, which contains
     // an expertly-written parser with configurable parameters. A bonus here
     // is that JSLINT allows me to avoid a number of other unsavory problems,
     // such as functions that log messages to a console -- such functions may
     // or may not be serializable, but their executions should definitely
     // occur on the same machines that invoked them! Anyway, this function is
     // only one solution to the serialization problem, and I welcome feedback
     // from others who may have battled the same problems :-)
        /*jslint unparam: true */
        if ((options instanceof Object) === false) {
            options = {};
        }
        var comm, $f, flag, left, right;
        if (x instanceof AVar) {
         // We'll put this back later.
            comm = x.comm;
            delete x.comm;
        }
        flag = false;
        left = '(function () {\nreturn ';
        right = ';\n}());';
        if (x instanceof Object) {
            if (is_Function(x)) {
                if (is_Function(x.toJSON)) {
                    $f = x.toJSON();
                } else if (is_Function(x.toSource)) {
                    $f = x.toSource();
                } else if (is_Function(x.toString)) {
                    $f = x.toString();
                } else {
                 // If we fall this far, we're probably in trouble anyway, but
                 // we aren't out of options yet. We could try to coerce to a
                 // string by adding an empty string or calling the String
                 // constructor without the `new` keyword, but I'm not sure if
                 // either would cause Quanah itself to fail JSLINT. Of course,
                 // we can always just play it safe and return `true` early to
                 // induce local execution of the function -- let's do that!
                    return true;
                }
             // By this point, `$f` must be defined, and it must be a string
             // or else the next line will fail when we try to remove leading
             // and trailing parentheses in order to appease JSLINT.
                $f = left + $f.replace(/^[(]|[)]$/g, '') + right;
             // Now, we send our function's serialized form `$f` into JSLINT
             // for analysis, taking care to disable all options that are not
             // directly relevant to determining if the function is suitable
             // for running in some remote JavaScript environment. If JSLINT
             // returns `false` because the scan fails for some reason, the
             // answer to our question would be `true`, which is why we have
             // to negate JSLINT's output.
                flag = (false === global.JSLINT($f, copy(options, {
                 // JSLINT configuration options, as of version 2012-07-27:
                    'adsafe':   false,  //- enforce ADsafe rules?
                    'anon':     true,   //- allow `function()`?
                    'bitwise':  true,   //- allow use of bitwise operators?
                    'browser':  false,  //- assume browser as JS environment?
                    'cap':      true,   //- allow uppercase HTML?
                    //confusion:true,   //- allow inconsistent type usage?
                    'continue': true,   //- allow continuation statement?
                    'css':      false,  //- allow CSS workarounds?
                    'debug':    false,  //- allow debugger statements?
                    'devel':    false,  //- allow output logging?
                    'eqeq':     true,   //- allow `==` instead of `===`?
                    'es5':      true,   //- allow ECMAScript 5 syntax?
                    'evil':     false,  //- allow the `eval` statement?
                    'forin':    true,   //- allow unfiltered `for..in`?
                    'fragment': false,  //- allow HTML fragments?
                    //'indent': 4,
                    //'maxerr': 50,
                    //'maxlen': 80,
                    'newcap':   true,   //- constructors must be capitalized?
                    'node':     false,  //- assume Node.js as JS environment?
                    'nomen':    true,   //- allow names' dangling underscores?
                    'on':       false,  //- allow HTML event handlers
                    'passfail': true,   //- halt the scan on the first error?
                    'plusplus': true,   //- allow `++` and `--` usage?
                    'predef':   {},     //- predefined global variables
                    'properties': false,//- require JSLINT /*properties */?
                    'regexp':   true,   //- allow `.` in regexp literals?
                    'rhino':    false,  //- assume Rhino as JS environment?
                    'safe':     false,  //- enforce safe subset of ADsafe?
                    'sloppy':   true,   //- ES5 strict mode pragma is optional?
                    'stupid':   true,   //- allow `*Sync` calls in Node.js?
                    'sub':      true,   //- allow all forms of subset notation?
                    'todo':     true,   //- allow comments that start with TODO
                    'undef':    false,  //- allow out-of-order definitions?
                    'unparam':  true,   //- allow unused parameters?
                    'vars':     true,   //- allow multiple `var` statements?
                    'white':    true,   //- allow sloppy whitespace?
                    //'widget': false,  //- assume Yahoo widget JS environment?
                    'windows':  false   //- assume Windows OS?
                })));
            }
            ply(x).by(function (key, val) {
             // This function examines all methods and properties of `x`
             // recursively to make sure none of those are closed, either.
             // Because order isn't important, use of `ply` is justified.
                if (flag === false) {
                    flag = is_closed(val, options);
                }
                return;
            });
        }
        if (is_Function(comm)) {
            x.comm = comm;
        }
        return flag;
    };

    is_Function = function (f) {
     // This function returns `true` if and only if input argument `f` is a
     // function. The second condition is necessary to avoid a false positive
     // in a pre-ES5 environment when `f` is a regular expression.
        return ((typeof f === 'function') && (f instanceof Function));
    };

    is_RegExp = function (x) {
     // This function *should* return `true` if and only if input argument `x`
     // is a RegExp. Unfortunately, it returns `true` if and only if it is an
     // instance of a constructor function named "RegExp", which is *not* the
     // same thing. I'm not sure yet how to work around this problem ...
        return (Object.prototype.toString.call(x) === '[object RegExp]');
    };

    is_String = function (x) {
     // This function returns a boolean that indicates whether the given
     // argument `x` can be safely assumed to have `String.prototype` methods.
        return ((typeof x === 'string') || (x instanceof String));
    };

    is_online = function () {
     // This function returns a boolean. It is not currently necessary, but I
     // have future plans that will require this function, so I have already
     // generalized QM in preparation.
        return (mothership === 'http://localhost:8177') || global.navigator.onLine;
    };

    jobs = function (box) {
     // This function retrieves a list of tasks that need to be executed.
        var y = ajax('GET', mothership + '/box/' + box + '?status=waiting');
        return y.Q(function (evt) {
         // This function needs documentation.
            y.val = JSON.parse(y.val);
            return evt.exit();
        });
    };

    lib = function (url) {
     // This function returns an avar.
        var y = avar();
        if (in_a_WebWorker()) {
            y.Q(function (evt) {
             // This function needs documentation.
                global.importScripts(url);
                return evt.exit();
            });
        } else if (in_a_browser()) {
            y.Q(function (evt) {
             // This function use the conventional "script tag loading"
             // technique to import external libraries. Ideally, it would try
             // to avoid loading libraries it has already loaded, but it turns
             // out that this is a very difficult once JSONP becomes involved
             // because those scripts _do_ need to reload every time. Thus, I
             // will need to start documenting best practices to teach others
             // how to construct idempotent scripts that won't leak memory and
             // plan to begin using "disposable execution contexts" like Web
             // Workers again soon.
             //
             // See also: http://goo.gl/byXCA and http://goo.gl/fUCXa .
             //
                /*jslint browser: true, unparam: true */
                var current, script;
                current = global.document.getElementsByTagName('script');
                script = global.document.createElement('script');
                if (is_Function(script.attachEvent)) {
                    script.attachEvent('onload', function onload() {
                     // This function needs documentation.
                        script.detachEvent('onload', onload);
                        if (script.parentElement === global.document.head) {
                            global.document.head.removeChild(script);
                        } else {
                            global.document.body.removeChild(script);
                        }
                        script = null;
                        return evt.exit();
                    });
                } else {
                    script.addEventListener('load', function onload() {
                     // This function needs documentation.
                        script.removeEventListener('load', onload, false);
                        if (script.parentElement === global.document.head) {
                            global.document.head.removeChild(script);
                        } else {
                            global.document.body.removeChild(script);
                        }
                        script = null;
                        return evt.exit();
                    }, false);
                }
                script.src = url;
                ply(current).by(function (key, val) {
                 // This function needs documentation.
                    if (script.src === val.src) {
                     // Aha! At long last, I have found a practical use for
                     // Cantor's Diagonalization argument :-P
                        script.src += '?';
                    }
                    return;
                });
                if ((global.document.body instanceof Object) === false) {
                    global.document.head.appendChild(script);
                } else {
                    global.document.body.appendChild(script);
                }
                current = null;
                return;
            });
        } else {
            y.Q(function (evt) {
             // This function needs documentation.
                return evt.fail('Missing `lib` definition');
            });
        }
        return y;
    };

    load_data = function (x, callback) {
     // This function is an incredibly rare one in the sense that it accepts
     // `x` which can be either an object literal or a string. Typically, I am
     // too "purist" to write such a _convenient_ function :-P
        var xdm, y, yql;
        xdm = function (evt) {
         // This function needs documentation.
            var proxy, request;
            proxy = global.document.createElement('iframe');
            request = this;
            proxy.src = request.val.via;
            proxy.display = 'none';
            proxy.style.visibility = 'hidden';
            proxy.onload = function () {
             // This function runs when the iframe loads.
                proxy.contentWindow.postMessage(JSON.stringify({
                    x: request.val.url
                }), proxy.src);
                return;
            };
            global.window.addEventListener('message', function cb(dom_evt) {
             // This function needs documentation.
                var temp = JSON.parse(dom_evt.data);
                if (temp.x === request.val.url) {
                    request.val = temp.y;
                    global.window.removeEventListener('message', cb, false);
                    global.document.body.removeChild(proxy);
                    proxy = null;
                    return evt.exit();
                }
                return;
            }, false);
            global.document.body.appendChild(proxy);
            return;
        };
        y = avar((x instanceof AVar) ? x : {val: x});
        yql = function (evt) {
         // This function uses Yahoo Query Language (YQL) as a cross-domain
         // proxy for retrieving text files. Binary file types probably won't
         // work very well at the moment, but I'll tweak the Open Data Table
         // I created soon to see what can be done toward that end.
            var base, callback, diag, format, query, temp;
            global.QM.shelf['temp' + y.key] = function (obj) {
             // This function needs documentation.
                if (obj.query.results === null) {
                    return evt.fail(obj.query.diagnostics);
                }
                y.val = obj.query.results.result;
                delete global.QM.shelf['temp' + y.key];
                return evt.exit();
            };
            base = '//query.yahooapis.com/v1/public/yql?';
            diag = 'diagnostics=true';
            callback = 'callback=QM.shelf.temp' + y.key;
            format = 'format=json';
            query = 'q=' +
                'USE "http://wilkinson.github.io/qmachine/qm.proxy.xml";' +
                'SELECT * FROM qm.proxy WHERE url="' + y.val.url + '";';
            temp = lib(base + [callback, diag, format, query].join('&'));
            temp.on('error', evt.fail);
            return;
        };
        y.on('error', function (message) {
         // This function needs documentation.
            if (is_Function(callback)) {
                y.val = callback(message, y.val);
            }
            return;
        }).Q(function (evt) {
         // This function needs documentation.
            var flag;
            flag = ((y.val instanceof Object)       &&
                    (y.val.hasOwnProperty('url'))   &&
                    (y.val.hasOwnProperty('via'))   &&
                    (in_a_browser() === true)       &&
                    (is_Function(global.window.postMessage)));
            return (flag === true) ? xdm.call(y, evt) : yql.call(y, evt);
        }).Q(function (evt) {
         // This function needs documentation.
            if (is_Function(callback)) {
                y.val = callback(null, y.val);
            }
            return evt.exit();
        });
        return y;
    };

    load_script = function (url, callback) {
     // This function loads external JavaScript files using the usual callback
     // idioms to which most JavaScripters are accustomed / addicted ;-)
        return lib(url).Q(function (evt) {
         // This function only runs if the script loaded successfully.
            if (is_Function(callback)) {
                callback(null);
            }
            return evt.exit();
        }).on('error', function (message) {
         // This function only runs if the script fails to load.
            if (is_Function(callback)) {
                callback(message);
            }
            return;
        });
    };

    map = function (x, f, box, env) {
     // This function needs documentation.
        var y = ((x instanceof AVar) ? x : avar({val: x})).Q(function (evt) {
         // This function needs documentation.
            var i, n, temp;
            n = this.val.length;
            temp = [];
            for (i = 0; i < n; i += 1) {
                temp[i] = submit(this.val[i], f, box, env);
                temp[i].on('error', evt.fail);
            }
            sync.apply(this, temp).Q(function (temp_evt) {
             // This function needs documentation.
                var i, n;
                n = temp.length;
                y.val = [];
                for (i = 0; i < n; i += 1) {
                    y.val[i] = temp[i].val;
                }
                temp_evt.exit();
                return evt.exit();
            });
            return;
        });
        return y;
    };

    mapreduce = function (x, mapf, redf, box, env) {
     // This function needs documentation.
        var y = avar();
        y.Q(function (evt) {
         // This function needs documentation.
            map(x, mapf, box, env).Q(function (temp_evt) {
             // This function needs documentation.
                y.val = this.val;
                temp_evt.exit();
                return evt.exit();
            }).on('error', evt.fail);
            return;
        }).Q(function (evt) {
         // This function needs documentation.
            reduce(y.val, redf, box, env).Q(function (temp_evt) {
             // This function needs documentation.
                y.val = this.val;
                temp_evt.exit();
                return evt.exit();
            }).on('error', evt.fail);
            return;
        });
        return y;
    };

    mothership = 'https://api.qmachine.org';

    origin = function () {
     // This function needs documentation.
        return global.location.protocol + '//' + global.location.host;
    };

    ply = function () {
     // This function has been condensed from its previous forms because
     // changes in Quanah 0.2.x made its support of dual asynchronous and
     // synchronous idioms both unnecessary and obsolete.
        var args = Array.prototype.slice.call(arguments);
        return {
            by: function (f) {
             // This function is a general-purpose iterator for key-value
             // pairs, and it works exceptionally well in JavaScript because
             // hash-like objects are so common in this language. This
             // definition itself is a little slower than previous versions
             // because they were optimized for internal use. In
             // performance-critical sections of Quanah that run often but
             // rarely change, I have inlined loops as appropriate. It is
             // difficult to optimize code for use with modern JIT compilers,
             // and my own recommendation is to hand-optimize with loops only
             // if you're truly obsessed with performance -- it's a lot of
             // work, and the auto-detecting and delegating dynamically in
             // order to use the fastest possible loop pattern adds overhead
             // that can be difficult to optimize for use in real-world
             // applications. That said, if you have ideas for how to make
             // `ply..by` run more efficiently, by all means drop me a line :-)
                if (is_Function(f) === false) {
                    throw new TypeError('`ply..by` expects a function.');
                }
                var i, key, obj, n, toc, x;
                n = args.length;
                toc = {};
                x = [];
                for (i = 0; i < n; i += 1) {
                    if ((args[i] !== null) && (args[i] !== undefined)) {
                        obj = args[i].valueOf();
                        for (key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                if (toc.hasOwnProperty(key) === false) {
                                    toc[key] = x.push([key]) - 1;
                                }
                                x[toc[key]][i + 1] = obj[key];
                            }
                        }
                    }
                }
                n = x.length;
                for (i = 0; i < n; i += 1) {
                    f.apply(this, x[i]);
                }
                return;
            }
        };
    };

    puts = function () {
     // This function needs documentation.
        var args = Array.prototype.slice.call(arguments);
        return sync.apply(this, args).Q(function (evt) {
         // This function needs documentation.
            if ((global.hasOwnProperty('console')) &&
                    (is_Function(global.console.log))) {
                global.console.log(args.join(' '));
                return evt.exit();
            }
            return evt.fail('The `console.log` method is not available.');
        }).on('error', function (message) {
         // This function needs documentation.
            if ((global.hasOwnProperty('console')) &&
                    (is_Function(global.console.error))) {
                global.console.error('Error:', message);
            }
            return;
        });
    };

    read = function (x) {
     // This function needs documentation.
        var y = ajax('GET', mothership + '/box/' + x.box + '?key=' + x.key);
        return y.Q(function (evt) {
         // This function deserializes the string returned as the `val` of
         // `y` into a temporary variable and then copies its property values
         // back onto `y`.
            copy(deserialize(y.val), y);
            return evt.exit();
        });
    };

    recent = function (method, url) {
     // This function helps keep clients from polling too rapidly when they are
     // waiting for a remote task to finish. It keeps track of HTTP requests
     // made within the last 1000 milliseconds in order to prevent repeat calls
     // that use the same method and URL. This doesn't affect task execution by
     // volunteers, however, because those alternate between GETs and POSTs.
        var dt, flag, key, time;
        dt = 1000;
        time = Date.now();
        for (key in state.recent) {
            if (state.recent.hasOwnProperty(key)) {
                if ((time - state.recent[key].time) > dt) {
                    delete state.recent[key];
                }
            }
        }
        flag = ((state.recent.hasOwnProperty(url)) &&
                (state.recent[url].method === method));
        if (flag === false) {
            state.recent[url] = {
                method: method,
                time:   time
            };
            revive(dt + 1);
        }
        return flag;
    };

    reduce = function (x, redf, box, env) {
     // This function needs documentation.
        var f, y;
        f = convert_to_js(redf);
        y = ((x instanceof AVar) ? x : avar({val: x})).Q(function (evt) {
         // This function needs documentation.
            if (is_Function(f.val) === false) {
                f.on('error', evt.fail);
                return evt.stay('Awaiting function translation ...');
            }
            if (this.val.length < 2) {
                this.val = this.val[0];
                return evt.exit();
            }
            var g, i, n, obj, temp, that, x;
            g = function (obj) {
             // This function needs documentation.
                return obj.f(obj.a, obj.b);
            };
            temp = [];
            that = this;
            x = that.val;
         // This line is easier to read than modulo junk ...
            n = 2 * Math.floor(x.length / 2);
            for (i = 0; i < n; i += 2) {
                obj = {f: f.val, a: x[i], b: x[i + 1]};
                temp.push(submit(obj, g, box, env).on('error', evt.fail));
            }
            if (n !== x.length) {
                temp.push(avar({val: x[x.length - 1]}).on('error', evt.fail));
            }
            sync.apply(this, temp).Q(function (temp_evt) {
             // This function needs documentation.
                var i, n, x;
                n = temp.length;
                x = [];
                for (i = 0; i < n; i += 1) {
                    x[i] = temp[i].val;
                }
                that.val = x;
                temp_evt.exit();
                return evt.stay('asynchronous loop');
            }).on('error', evt.fail);
            return;
        });
        return y;
    };

    revive = function (ms) {
     // This function restarting Quanah's event loop asynchronously using the
     // browser's own event loop if possible. It accepts an optional argument
     // specifying the number of milliseconds to wait before restarting.
        var dt = parseInt(ms, 10);
        if (is_Function(global.setTimeout)) {
            global.setTimeout(AVar.prototype.revive, isNaN(dt) ? 0 : dt);
        } else {
            AVar.prototype.revive();
        }
        return;
    };

    run_remotely = function (obj) {
     // This function distributes computations to remote execution nodes by
     // constructing a task that represents the computation, writing it to a
     // shared storage, polling for changes to its status, and then reading
     // the new values back into the local variables. My strategy is to use
     // a bunch of temporary avars that only execute locally -- on this part
     // I must be very careful, because remote calls should be able to make
     // remote calls of their own, but execution of a remote call should not
     // require remote calls of its own! A publication is forthcoming, and at
     // that point I'll simply use a self-citation as an explanation :-)
        var f, first, handler, x;
     // Step 1: copy the computation's function and data into fresh instances,
     // define some error handlers, and write the copies to the "filesystem".
     // If special property values have been added to `x`, they will be copied
     // onto `f` and `x` via the "copy constructor" idiom. Note that special
     // properties defined for `f` will be overwritten ...
        f = avar({box: obj.x.box, val: obj.f});
        first = true;
        handler = function (message) {
         // This function tells the original `x` that something has gone awry.
            if (first === true) {
                first = false;
                obj.x.comm({fail: message});
            }
            return;
        };
        x = avar({box: obj.x.box, key: obj.x.key, val: obj.x.val});
        f.on('error', handler).Q(update_remote);
        x.on('error', handler).Q(update_remote);
     // Step 2: Use a `sync` statement to represent the remote computation and
     // track its execution status on whatever system is using Quanah.
        sync(f, x).Q(function (evt) {
         // This function creates a `task` object to represent the computation
         // and monitors its status by "polling" the "filesystem" for changes.
         // It initializes using `avar`'s "copy constructor" idiom to enable
         // `task` to "inherit" system-specific properties such as QMachine's
         // `box` property automatically. My design here reflects the idea that
         // the execution should follow the data.
            var task = avar({
                box: obj.x.box,
                status: 'waiting',
                val: {
                    f: f.key,
                    x: x.key
                }
            });
            task.on('error', function (message) {
             // This function alerts `f` and `x` that something has gone awry.
                return evt.fail(message);
            }).Q(update_remote).Q(function (evt) {
             // This function polls for changes in the `status` property using
             // a variation on the `update_local` function as a non-blocking
             // `while` loop -- hooray for disposable avars!
                var temp = read(task);
                temp.on('error', function (message) {
                 // This alerts `task` that something has gone awry.
                    return evt.fail(message);
                }).Q(function (temp_evt) {
                 // This function analyzes the results of the `read` operation
                 // to determine if the `task` computation is ready to proceed.
                    switch (temp.status) {
                    case 'done':
                        task.val = temp.val;
                        evt.exit();
                        break;
                    case 'failed':
                        evt.fail(temp.val.epitaph);
                        break;
                    default:
                        evt.stay('Waiting for results ...');
                    }
                    return temp_evt.exit();
                });
                return;
            }).Q(function (task_evt) {
             // This function ends the enclosing `sync` statement.
                task_evt.exit();
                return evt.exit();
            });
            return;
        });
     // Step 3: Update the local instances of `f` and `x` by retrieving the
     // remote versions' representations. If possible, these operations will
     // run concurrently.
        f.Q(update_local);
        x.Q(update_local);
     // Step 4: Use a `sync` statement to wait for the updates in Step 3 to
     // finish before copying the new values into the original `obj` argument.
        sync(f, x).Q(function (evt) {
         // This function copies the new values into the old object. Please
         // note that we cannot simply write `obj.foo = foo` because we would
         // lose the original avar's internal state!
            obj.f = f.val;
            obj.x.val = x.val;
            obj.x.comm({done: []});
            return evt.exit();
        });
        return;
    };

    serialize = function (x) {
     // This function extends the standard `JSON.stringify` function with
     // support for functions and regular expressions. One of the problems I
     // address here is that the ES5.1 standard doesn't dictate a format for
     // representing functions as strings (see section 15.3.4.2). Another
     // problem is that the standard dictates that _no_ representation be given
     // at all in certain situations (see section 15.3.4.5). Fortunately, we
     // can avoid a lot of these situations entirely by using JSLint prior to
     // invoking the `serialize` function, but it isn't a perfect solution,
     // since users can currently invoke this function indirectly by calling
     // `JSON.stringify`. Also, this function depends on `btoa`, which may or
     // may not have issues with UTF-8 strings in different browsers. I have
     // not found a test case yet that proves I need to work around the issue,
     // but if I do, I will follow advice given at http://goo.gl/cciXV.
        /*jslint unparam: true */
        return JSON.stringify(x, function replacer(key, val) {
         // For more information on the use of `replacer` functions with the
         // `JSON.stringify` method, read the [inline] documentation for the
         // reference implementation, "json2.js", available online at
         // https://raw.github.com/douglascrockford/JSON-js/master/json2.js.
            var obj, $val;
            if (is_Function(val)) {
             // If the input argument `x` was actually a function, we have to
             // perform two steps to serialize the function because functions
             // are objects in JavaScript. The first step is to consider the
             // function as only its "action", represented as the source code
             // of the original function. The second step is to consider the
             // function as only an object with its own methods and properties
             // that must be preserved as source code also. (We can assume that
             // scope need not be preserved because `serialize` is only called
             // when `is_closed` returns `false`.)
                obj = {};
                $val = '[FUNCTION ';
                if (is_Function(val.toJSON)) {
                    $val += btoa(val.toJSON());
                } else if (is_Function(val.toSource)) {
                    $val += btoa(val.toSource());
                } else if (is_Function(val.toString)) {
                    $val += btoa(val.toString());
                } else {
                 // Here, we just hope for the best. This arm shouldn't ever
                 // run, actually, since we've likely already caught problems
                 // that would land here in the `is_closed` function.
                    $val += btoa(val);
                }
                ply(val).by(function f(key, val) {
                 // This function copies methods and properties from the
                 // function stored in `val` onto an object `obj` so they can
                 // be serialized separately from the function itself, but it
                 // only transfers the ones a function wouldn't normally have,
                 // using this function (`f`) itself as a reference. Because
                 // order isn't important, the use of `ply` is justified here.
                    if (f.hasOwnProperty(key) === false) {
                        obj[key] = val;
                    }
                    return;
                });
             // Now, we use recursion to serialize the methods and properties.
                $val += (' ' + btoa(serialize(obj)) + ']');
            } else if (is_RegExp(val)) {
             // Using a similar approach as for functions for almost exactly
             // the same reasons as for functions, we will now try to serialize
             // regular expressions.
                obj = {};
                $val = '[REGEXP ';
                if (val.hasOwnProperty('source')) {
                    $val += btoa([
                     // For now, I am ignoring the non-standard `y` ("sticky")
                     // flag until I confirm that it won't confuse browsers
                     // that don't support it.
                        '/', val.source, '/',
                        ((val.global === true) ? 'g' : ''),
                        ((val.ignoreCase === true) ? 'i' : ''),
                        ((val.multiline === true) ? 'm' : '')
                    ].join(''));
                } else if (is_Function(val.toJSON)) {
                    $val += btoa(val.toJSON());
                } else if (is_Function(val.toSource)) {
                    $val += btoa(val.toSource());
                } else if (is_Function(val.toString)) {
                    $val += btoa(val.toString());
                } else {
                 // Here, we just hope for the best. This arm shouldn't ever
                 // run, actually, since we've likely already caught problems
                 // that would land here in the `is_closed` function.
                    $val += btoa(val);
                }
                ply(val, /^$/).by(function f(key, val, standard) {
                 // This function copies methods and properties from the
                 // regular expression stored in the outer `val` onto an object
                 // `obj` so they can be serialized separately from the regular
                 // expression itself, but it only transfers the ones a regular
                 // expression wouldn't normally have. Because order isn't
                 // important, the use of `ply` is justified here.
                    if ((standard === undefined) && (val !== undefined)) {
                        obj[key] = val;
                    }
                    return;
                });
             // Now, we use recursion to serialize the methods and properties.
                $val += (' ' + btoa(serialize(obj)) + ']');
            }
            return ($val === undefined) ? val : $val;
        });
    };

    state = {
        box: avar().key,
        exemptions: {},
        recent: {}
    };

    submit = function (x, f, box, env) {
     // This function needs documentation.
        var arg_box, arg_env, arg_f, arg_x, y;
        if (arguments.length === 1) {
         // Assume here that the input argument is an object with properties
         // corresponding to the four variables. Although this is my preferred
         // syntax, it is not the default because the `submit` function is not
         // intended for advanced users anyway -- it's the "training wheels"
         // version of QM.
            arg_box = x.box;
            arg_env = x.env;
            arg_f = x.f;
            arg_x = x.x;
        } else {
            arg_box = box;
            arg_env = env;
            arg_f = f;
            arg_x = x;
        }
        y = avar();
        y.on('error', function (message) {
         // This function _can_ be overridden if the user specifies his or her
         // own handler. Otherwise, this function ensures that errors cause the
         // computation to self-destruct in a really ugly horrible way :-P
            throw message;
        });
        sync(arg_box, arg_env, arg_f, arg_x, y).Q(function (evt) {
         // This function runs locally.
            var box, env, f, x;
            box = (arg_box instanceof AVar) ? arg_box.val : arg_box;
            env = (arg_env instanceof AVar) ? arg_env.val : arg_env;
            f = (arg_f instanceof AVar) ? arg_f.val : arg_f;
            x = (arg_x instanceof AVar) ? arg_x.val : arg_x;
            if (is_String(box)) {
                y.box = box;
            }
            convert_to_js(f).Q(function (f_evt) {
             // This function needs documentation.
                y.val = {
                    env: ((env instanceof Object) ? env : {}),
                    f: this.val,
                    x: x
                };
                f_evt.exit();
                return evt.exit();
            }).on('error', evt.fail);
            return;
        });
        y.Q(function (evt) {
         // This function runs locally.
            var key, options, task, temp;
            options = {
                predef: {
                    'QM': false
                }
            };
            task = {
                f: y.val.f,
                x: y.val.x
            };
            for (key in y.val.env) {
                if (y.val.env.hasOwnProperty(key)) {
                    options.predef[key] = false;
                }
            }
            if (is_closed(task, options)) {
                return evt.fail(global.JSLINT.errors[0].reason);
            }
            temp = avar({box: y.box, val: y.val});
            state.exemptions[temp.key] = options;
            temp.on('error', function (message) {
             // This function needs documentation.
                delete state.exemptions[temp.key];
                return evt.fail(message);
            });
            temp.Q(function (evt) {
             // This function runs remotely on a volunteer machine.
                /*global QM: false */
                var env, f, temp, x;
                env = QM.avar({val: this.val.env});
                f = this.val.f;
                temp = this;
                x = QM.avar({val: this.val.x});
                env.on('error', evt.fail);
                x.on('error', evt.fail);
                QM.sync(env, x).Q(function (evt) {
                 // This function ensures that the task will not execute until
                 // the prerequisite scripts have finished loading.
                    var prereqs = [];
                    QM.ply(env.val).by(function (key, val) {
                     // This function needs documentation.
                        var libs = QM.avar({val: val.slice()});
                        libs.on('error', function (message) {
                         // This function needs documentation.
                            return evt.fail(message);
                        }).Q(function (evt) {
                         // This function needs documentation.
                            if (libs.val.length === 0) {
                                return evt.exit();
                            }
                            var v = libs.val;
                            QM.load_script(v.shift()).Q(function (v_evt) {
                             // This function needs documentation.
                                v_evt.exit();
                                if (v.length === 0) {
                                 // This shaves off an extra step, but I'm not
                                 // sure if it's worth the extra lines ...
                                    return evt.exit();
                                }
                                return evt.stay('Recursing ... (' + key + ')');
                            }).on('error', function (message) {
                             // This function needs documentation.
                                return evt.fail(message);
                            });
                            return;
                        });
                        prereqs.push(libs);
                        return;
                    });
                    if (prereqs.length === 0) {
                        return evt.exit();
                    }
                    QM.sync.apply(null, prereqs).Q(function (w_evt) {
                     // This function needs documentation.
                        w_evt.exit();
                        return evt.exit();
                    });
                    return;
                });
                x.Q(function (evt) {
                 // This function is crucial for enabling synchronous syntax in
                 // the asynchronous world of the web.
                    var temp = f(this.val);
                    if (temp instanceof QM.avar().constructor) {
                        temp.Q(function (temp_evt) {
                         // This function needs documentation.
                            x.val = temp.val;
                            temp_evt.exit();
                            return evt.exit();
                        }).on('error', function (message) {
                         // This function needs documentation.
                            return evt.fail(message);
                        });
                        return;
                    }
                    this.val = temp;
                    return evt.exit();
                }).Q(function (x_evt) {
                 // This function needs documentation.
                    temp.val = x.val;
                    x_evt.exit();
                    return evt.exit();
                });
                return;
            }).Q(function (temp_evt) {
             // This function runs locally.
                delete state.exemptions[temp.key];
                y.val = temp.val;
                temp_evt.exit();
                return evt.exit();
            });
            return;
        });
        return y;
    };

    sync = global.QUANAH.sync;

    update_local = function (evt) {
     // This function is used in the `run_remotely` and `volunteer` functions
     // to update the local copy of an avar so that its `val` property matches
     // the one from its remote representation. It is written as a function of
     // `evt` because it is intended to be used as an argument to Method Q.
        var local = this;
        read(local).Q(function (temp_evt) {
         // This function copies the remote representation's property values
         // onto `local`. Note that the `copy` function does not copy `comm`
         // from `this` to `local` because `evt.exit` wouldn't work anymore.
            copy(this, local);
            temp_evt.exit();
            return evt.exit();
        }).on('error', function (message) {
         // This function tells `local` that something has gone awry.
            return evt.fail(message);
        });
        return;
    };

    update_remote = function (evt) {
     // This function is used in the `remote_call` and `volunteer` functions
     // to update the remote copy of an avar so that its `val` property matches
     // the one from its local representation. It is written as a function of
     // `evt` because it is intended to be used as an argument to Method Q.
        write(this).Q(function (temp_evt) {
         // This function just releases execution for the local avar (`this`).
            temp_evt.exit();
            return evt.exit();
        }).on('error', function (message) {
         // This function tells the local avar that something has gone awry.
            return evt.fail(message);
        });
        return;
    };

    volunteer = function (box) {
     // This function, combined with `run_remotely`, provides the remote code
     // execution mechanism in Quanah. When `run_remotely` on one machine sends
     // a serialized task to another machine, that other machine runs it with
     // the `volunteer` function. This function outputs the avar representing
     // the task so that the underlying system (QM, in this case) can control
     // system resources itself. Examples will be included in the distribution
     // that will accompany the upcoming publication(s).
        if (is_String(box) === false) {
            box = global.QM.box;
        }
        var task = avar({box: box});
        task.Q(function (evt) {
         // This function retrieves the key of a task from the queue so we
         // can retrieve that task's full description. If no tasks are found,
         // we will simply check back later :-)
            var temp = jobs(box);
            temp.on('error', function (message) {
             // This function notifies `task` that something has gone wrong
             // during retrieval and interpretation of its description.
                return evt.fail(message);
            }).Q(function (temp_evt) {
             // This function chooses a task from the queue and runs it.
                var queue = temp.val;
                if ((queue instanceof Array) === false) {
                 // This seems like a common problem that will occur whenever
                 // users begin implementing custom storage mechanisms.
                    return temp_evt.fail('`jobs` should return an array');
                }
                if (queue.length === 0) {
                 // Here, we choose to `fail` not because this is a dreadful
                 // occurrence or something, but because this decision allows
                 // us to avoid running subsequent functions whose assumptions
                 // depend precisely on having found a task to run. If we were
                 // instead to `stay` and wait for something to do, it would
                 // be much harder to tune Quanah externally.
                    return temp_evt.fail('Nothing to do ...');
                }
             // Here, we grab a random entry from the queue, rather than the
             // first element in the queue. Why? Well, recall that tasks cannot
             // enter the "global" queue until the avars they will transform
             // are ready; this immediately implies that no task in the remote
             // queue can ever run out of order anyway. Unfortunately, without
             // fancy server-side transactional logic, workers can potentially
             // execute the same job redundantly, especially when there are a
             // large number of workers and a small number of jobs. This isn't
             // a big deal for an opportunistic system, and it may even be a
             // desirable "inefficiency" because it means the invoking machine
             // will get an answer faster. In some cases, though, such as for
             // batch jobs that take roughly the same amount of time to run, we
             // need to "jitter" the queue a little to avoid deadlock.
                task.key = queue[Math.floor(Math.random() * queue.length)];
                temp_evt.exit();
                return evt.exit();
            });
            return;
        }).Q(function (evt) {
         // This is just for debugging purposes ...
            update_local.call(this, evt);
            return;
        }).Q(function (evt) {
         // This function changes the `status` property of the local `task`
         // object we just synced from remote; the next step, obviously, is
         // to sync back to remote so that the abstract task will disappear
         // from the "waiting" queue.
            task.status = 'running';
            return evt.exit();
        }).Q(update_remote).Q(function (evt) {
         // This function executes the abstract task by recreating `f` and `x`
         // and running them in the local environment. Since we know `task` is
         // serializable, we cannot simply add its deserialized form to the
         // local machine's queue (`queue`), because `revive` would just send
         // it back out for remote execution again. Thus, we deliberately close
         // over local variables like `avar` in order to restrict execution to
         // the current environment. The transform defined in `task.val.f` is
         // still able to distribute its own sub-tasks for remote execution.
            var f, first, handler, x;
            f = avar({box: box, key: task.val.f});
            first = true;
            handler = function (message) {
             // This function runs if execution of the abstract task fails.
             // The use of a `first` value prevents this function from running
             // more than once, because aside from annoying the programmer by
             // returning lots of error messages on his or her screen, such a
             // situation can also wreak all kinds of havoc for reentrancy.
                var temp_f, temp_x;
                if (message === 409) {
                 // If we get `409` as an error message, it is most likely to
                 // be because the server has already received a result for
                 // this task from some other volunteer and thus that we have
                 // received a `409` HTTP status code for an update conflict.
                    return evt.fail('Results were already submitted.');
                }
                if (first) {
                    first = false;
                    task.val.epitaph = message;
                    task.status = 'failed';
                    temp_f = avar(f).Q(update_remote);
                    temp_x = avar(x).Q(update_remote);
                    sync(temp_f, temp_x).Q(function (temp_evt) {
                     // This function runs only when the error messages have
                     // finished syncing to remote storage successfully.
                        temp_evt.exit();
                        return evt.exit();
                    });
                }
                return;
            };
            x = avar({box: box, key: task.val.x});
            f.Q(update_local).on('error', handler);
            x.Q(update_local).on('error', handler);
            sync(f, x).Q(function (evt) {
             // This function contains the _actual_ execution. (Boring, huh?)
                f.val.call(x, evt);
                return;
            });
         //
         // Here, I would like to have a function that checks `f` and `x` to
         // using `is_closed` to ensure that the results it returns to the
         // invoking machine are the same as the results it computed, because
         // it _is_ actually possible to write a serializable function which
         // renders itself unserializable during its evaluation. Specifically,
         // if the results are not serializable and we are therefore unable to
         // return an accurate representation of the results, then I want to
         // send a special signal to the invoking machine to let it know that,
         // although no error has occurred, results will not be returned; the
         // invoking machine would then execute the "offending" task itself.
         // I have included a simple outline of such a function:
         //
         //     sync(f, x).Q(function (evt) {
         //         if (is_closed(f.val) || is_closed(x.val)) {
         //             return evt.abort('Results will not be returned.');
         //         }
         //         return evt.exit();
         //     });
         //
            f.Q(update_remote);
            x.Q(update_remote);
            sync(f, x).Q(function (temp_evt) {
             // This function only executes when the task has successfully
             // executed and the transformed values of `f` and `x` are synced
             // back to remote storage. Thus, we are now free to send the
             // signal for successful completion to the invoking machine by
             // updating the `status` property locally and syncing to remote.
                task.status = 'done';
                temp_evt.exit();
                return evt.exit();
            });
            return;
        }).Q(update_remote);
        return task;
    };

    write = function (x) {
     // This function sends an HTTP POST to QMachine. It doesn't worry
     // about the return data because QMachine isn't going to return
     // any data -- the request will either succeed or fail, as
     // indicated by the HTTP status code returned. It returns an avar.
        var url = mothership + '/box/' + x.box + '?key=' + x.key;
        return ajax('POST', url, JSON.stringify(x));
    };

 // Prototype definitions

    defineProperty(AVar.prototype, 'box', {
     // This definition adds a `box` property to Quanah's avars as a means to
     // enable QMachine's per-instance queueing system. The other necessary
     // component is the `QM.box` definition a little further down.
        configurable: true,
        enumerable: false,
        get: function () {
         // This function needs documentation.
            return state.box;
        },
        set: function (x) {
         // This function needs documentation.
            if (is_String(x) === false) {
                throw new TypeError('`box` property must be a string.');
            }
            if ((/^[\w\-]+$/).test(x) === false) {
                throw new Error('Invalid assignment to `box`: "' + x + '"');
            }
            defineProperty(this, 'box', {
                configurable: true,
                enumerable: true,
                writable: true,
                value: x
            });
            return;
        }
    });

    defineProperty(AVar.prototype, 'print', {
     // NOTE: I commented two of the next three lines out because their values
     // are the default ones specified by the ES5.1 standard.
        //configurable: false,
        enumerable: true,
        //writable: false,
        value: function () {
         // This function is syntactic sugar for logging output.
            QM.puts(this);
            return this;
        }
    });

    defineProperty(AVar.prototype, 'toJSON', {
     // NOTE: I commented two of the next three lines out because their values
     // are the default ones specified by the ES5.1 standard.
        //configurable: false,
        enumerable: true,
        //writable: false,
        value: function () {
         // This function exists as a way to ensure that `JSON.stringify` can
         // serialize avars correctly, because that function will delegate to
         // an input argument's `toJSON` prototype method if one is available.
            var comm, y;
            comm = this.comm;
            delete this.comm;
            y = JSON.parse(serialize(copy(this)));
            this.comm = comm;
            return y;
        }
    });

 // Out-of-scope definitions

    defineProperty(global, 'QM', {
     // This creates the "namespace" for QMachine as a global `QM` object.
     // NOTE: I commented out two of the next three lines because their values
     // match the ES5.1 default values.
        //configurable: false,
        enumerable: true,
        //writable: false,
        value: {}
    });

    defineProperty(global.QM, 'box', {
     // Here, we enable users to send jobs to different "boxes" by labeling
     // the avars on a per-case basis, rather than on a session-level basis.
     // More explanation will be included in the upcoming paper :-)
        configurable: false,
        enumerable: true,
        get: function () {
         // This function needs documentation.
            return state.box;
        },
        set: function (x) {
         // This function needs documentation.
            if (is_String(x) === false) {
                throw new TypeError('`QM.box` must be a string.');
            }
            if ((/^[\w\-]+$/).test(x) === false) {
                throw new Error('Invalid assignment to `QM.box`: "' + x + '"');
            }
            state.box = x;
            global.QM.revive();
            return;
        }
    });

    (function () {
     // Here, we add some static methods to `QM` that make QMachine a little
     // more convenient to use ...
        var template;
        template = {
            avar:           avar,
            lib:            lib,
            load_data:      load_data,
            load_script:    load_script,
            map:            map,
            mapreduce:      mapreduce,
            ply:            ply,
            puts:           puts,
            reduce:         reduce,
            revive:         revive,
            shelf:          {},
            submit:         submit,
            sync:           sync,
            volunteer:      volunteer
        };
        ply(template).by(function (key, val) {
         // This function needs documentation.
            if (global.QM.hasOwnProperty(key) === false) {
                defineProperty(global.QM, key, {
                 // NOTE: I commented out two of the next three lines
                 // because their values match the ES5.1 default values.
                    //configurable: false,
                    enumerable: true,
                    //writable: false,
                    value: val
                });
            }
            return;
        });
        return;
    }());

 // Invocations

    global.QUANAH.def({
        can_run_remotely:   can_run_remotely,
        run_remotely:       run_remotely
    });

 // That's all, folks!

    return;

}(Function.prototype.call.call(function (that) {
    'use strict';

 // This strict anonymous closure encapsulates the logic for detecting which
 // object in the environment should be treated as _the_ global object. It's
 // not as easy as you may think -- strict mode disables the `call` method's
 // default behavior of replacing `null` with the global object. Luckily, we
 // can work around that by passing a reference to the enclosing scope as an
 // argument at the same time and testing to see if strict mode has done its
 // deed. This task is not hard in the usual browser context because we know
 // that the global object is `window`, but CommonJS implementations such as
 // RingoJS confound the issue by modifying the scope chain, running scripts
 // in sandboxed contexts, and using identifiers like `global` carelessly ...

    /*global global: false */
    /*jslint indent: 4, maxlen: 80 */
    /*properties global */

    if (this === null) {

     // Strict mode has captured us, but we already passed a reference :-)

        return (typeof global === 'object') ? global : that;

    }

 // Strict mode isn't supported in this environment, but we need to make sure
 // we don't get fooled by Rhino's `global` function.

    return (typeof this.global === 'object') ? this.global : this;

}, null, this), function ($f) {
    'use strict';

 // This is a sandbox for resuscitating function code safely. I will explain
 // more later ...

    /*jslint evil: true, indent: 4, maxlen: 80 */

    return (new Function('return ' + $f))();

}));

//- vim:set syntax=javascript:
// jslint.js
// 2013-05-31

// Copyright (c) 2002 Douglas Crockford  (www.JSLint.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// The Software shall be used for Good, not Evil.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// WARNING: JSLint will hurt your feelings.

// JSLINT is a global function. It takes two parameters.

//     var myResult = JSLINT(source, option);

// The first parameter is either a string or an array of strings. If it is a
// string, it will be split on '\n' or '\r'. If it is an array of strings, it
// is assumed that each string represents one line. The source can be a
// JavaScript text or a JSON text.

// The second parameter is an optional object of options that control the
// operation of JSLINT. Most of the options are booleans: They are all
// optional and have a default value of false. One of the options, predef,
// can be an array of names, which will be used to declare global variables,
// or an object whose keys are used as global names, with a boolean value
// that determines if they are assignable.

// If it checks out, JSLINT returns true. Otherwise, it returns false.

// If false, you can inspect JSLINT.errors to find out the problems.
// JSLINT.errors is an array of objects containing these properties:

//  {
//      line      : The line (relative to 0) at which the lint was found
//      character : The character (relative to 0) at which the lint was found
//      reason    : The problem
//      evidence  : The text line in which the problem occurred
//      raw       : The raw message before the details were inserted
//      a         : The first detail
//      b         : The second detail
//      c         : The third detail
//      d         : The fourth detail
//  }

// If a stopping error was found, a null will be the last element of the
// JSLINT.errors array. A stopping error means that JSLint was not confident
// enough to continue. It does not necessarily mean that the error was
// especially heinous.

// You can request a data structure that contains JSLint's results.

//     var myData = JSLINT.data();

// It returns a structure with this form:

//     {
//         errors: [
//             {
//                 line: NUMBER,
//                 character: NUMBER,
//                 reason: STRING,
//                 evidence: STRING
//             }
//         ],
//         functions: [
//             {
//                 name: STRING,
//                 line: NUMBER,
//                 level: NUMBER,
//                 parameter: [
//                     STRING
//                 ],
//                 var: [
//                     STRING
//                 ],
//                 exception: [
//                     STRING
//                 ],
//                 closure: [
//                     STRING
//                 ],
//                 outer: [
//                     STRING
//                 ],
//                 global: [
//                     STRING
//                 ],
//                 label: [
//                     STRING
//                 ]
//             }
//         ],
//         global: [
//             STRING
//         ],
//         member: {
//             STRING: NUMBER
//         },
//         json: BOOLEAN
//     }

// You can request a Function Report, which shows all of the functions
// and the parameters and vars that they use. This can be used to find
// implied global variables and other problems. The report is in HTML and
// can be inserted into an HTML <body>. It should be given the result of the
// JSLINT.data function.

//     var myReport = JSLINT.report(data);

// You can request an HTML error report.

//     var myErrorReport = JSLINT.error_report(data);

// You can obtain an object containing all of the properties found in the
// file. JSLINT.property contains an object containing a key for each
// property used in the program, the value being the number of times that
// property name was used in the file.

// You can request a properties report, which produces a list of the program's
// properties in the form of a /*properties*/ declaration.

//      var myPropertyReport = JSLINT.properties_report(JSLINT.property);

// You can obtain the parse tree that JSLint constructed while parsing. The
// latest tree is kept in JSLINT.tree. A nice stringification can be produced
// with

//     JSON.stringify(JSLINT.tree, [
//         'string',  'arity', 'name',  'first',
//         'second', 'third', 'block', 'else'
//     ], 4));

// You can request a context coloring table. It contains information that can be
// applied to the file that was analyzed. Context coloring colors functions
// based on their nesting level, and variables on the color of the functions
// in which they are defined.

//      var myColorization = JSLINT.color(data);

// It returns an array containing objects of this form:

//      {
//          from: COLUMN,
//          thru: COLUMN,
//          line: ROW,
//          level: 0 or higher
//      }

// JSLint provides three inline directives. They look like slashstar comments,
// and allow for setting options, declaring global variables, and establishing a
// set of allowed property names.

// These directives respect function scope.

// The jslint directive is a special comment that can set one or more options.
// For example:

/*jslint
    es5: true, evil: true, nomen: true, regexp: true, todo: true
*/

// The current option set is

//     ass        true, if assignment expressions should be allowed
//     bitwise    true, if bitwise operators should be allowed
//     browser    true, if the standard browser globals should be predefined
//     closure    true, if Google Closure idioms should be tolerated
//     continue   true, if the continuation statement should be tolerated
//     debug      true, if debugger statements should be allowed
//     devel      true, if logging should be allowed (console, alert, etc.)
//     eqeq       true, if == should be allowed
//     es5        true, if ES5 syntax should be allowed
//     evil       true, if eval should be allowed
//     forin      true, if for in statements need not filter
//     indent     the indentation factor
//     maxerr     the maximum number of errors to allow
//     maxlen     the maximum length of a source line
//     newcap     true, if constructor names capitalization is ignored
//     node       true, if Node.js globals should be predefined
//     nomen      true, if names may have dangling _
//     passfail   true, if the scan should stop on first error
//     plusplus   true, if increment/decrement should be allowed
//     properties true, if all property names must be declared with /*properties*/
//     regexp     true, if the . should be allowed in regexp literals
//     rhino      true, if the Rhino environment globals should be predefined
//     unparam    true, if unused parameters should be tolerated
//     sloppy     true, if the 'use strict'; pragma is optional
//     stupid     true, if really stupid practices are tolerated
//     sub        true, if all forms of subscript notation are tolerated
//     todo       true, if TODO comments are tolerated
//     vars       true, if multiple var statements per function should be allowed
//     white      true, if sloppy whitespace is tolerated

// The properties directive declares an exclusive list of property names.
// Any properties named in the program that are not in the list will
// produce a warning.

// For example:

/*properties
    '\b', '\t', '\n', '\f', '\r', '!', '!=', '!==', '"', '%', '\'', '(begin)',
    '(error)', '*', '+', '-', '/', '<', '<=', '==', '===', '>', '>=', '\\', a,
    a_label, a_scope, already_defined, and, arguments, arity, ass, assign,
    assignment_expression, assignment_function_expression, at, avoid_a, b,
    bad_assignment, bad_constructor, bad_in_a, bad_invocation, bad_new,
    bad_number, bad_operand, bad_wrap, bitwise, block, browser, c, call, charAt,
    charCodeAt, character, closure, code, color, combine_var, comments,
    conditional_assignment, confusing_a, confusing_regexp, constructor_name_a,
    continue, control_a, couch, create, d, dangling_a, data, dead, debug,
    deleted, devel, disrupt, duplicate_a, edge, edition, else, empty_block,
    empty_case, empty_class, entityify, eqeq, error_report, errors, es5,
    evidence, evil, exception, exec, expected_a_at_b_c, expected_a_b,
    expected_a_b_from_c_d, expected_id_a, expected_identifier_a,
    expected_identifier_a_reserved, expected_number_a, expected_operator_a,
    expected_positive_a, expected_small_a, expected_space_a_b,
    expected_string_a, f, first, flag, floor, forEach, for_if, forin, from,
    fromCharCode, fud, function, function_block, function_eval, function_loop,
    function_statement, function_strict, functions, global, hasOwnProperty, id,
    identifier, identifier_function, immed, implied_evil, indent, indexOf,
    infix_in, init, insecure_a, isAlpha, isArray, isDigit, isNaN, join, jslint,
    json, keys, kind, label, labeled, lbp, leading_decimal_a, led, left, length,
    level, line, loopage, master, match, maxerr, maxlen, message, missing_a,
    missing_a_after_b, missing_property, missing_space_a_b, missing_use_strict,
    mode, move_invocation, move_var, n, name, name_function, nested_comment,
    newcap, node, nomen, not, not_a_constructor, not_a_defined, not_a_function,
    not_a_label, not_a_scope, not_greater, nud, number, octal_a, open, outer,
    parameter, parameter_a_get_b, parameter_arguments_a, parameter_set_a,
    params, paren, passfail, plusplus, postscript, predef, properties,
    properties_report, property, prototype, push, quote, r, radix, raw,
    read_only, reason, regexp, relation, replace, report, reserved, reserved_a,
    rhino, right, scanned_a_b, scope, search, second, shift, slash_equal, slice,
    sloppy, sort, split, statement, statement_block, stop, stopping,
    strange_loop, strict, string, stupid, sub, subscript, substr, supplant,
    sync_a, t, tag_a_in_b, test, third, thru, toString, todo, todo_comment,
    token, tokens, too_long, too_many, trailing_decimal_a, tree, unclosed,
    unclosed_comment, unclosed_regexp, unescaped_a, unexpected_a,
    unexpected_char_a, unexpected_comment, unexpected_label_a,
    unexpected_property_a, unexpected_space_a_b, unexpected_typeof_a,
    uninitialized_a, unnecessary_else, unnecessary_initialize, unnecessary_use,
    unparam, unreachable_a_b, unsafe, unused_a, url, use_array, use_braces,
    use_object, use_or, use_param, use_spaces, used, used_before_a, var,
    var_a_not, var_loop, vars, varstatement, warn, warning, was,
    weird_assignment, weird_condition, weird_new, weird_program, weird_relation,
    weird_ternary, white, wrap, wrap_immediate, wrap_regexp, write_is_wrong,
    writeable
*/

// The global directive is used to declare global variables that can
// be accessed by the program. If a declaration is true, then the variable
// is writeable. Otherwise, it is read-only.

// We build the application inside a function so that we produce only a single
// global variable. That function will be invoked immediately, and its return
// value is the JSLINT function itself. That function is also an object that
// can contain data and other functions.

var JSLINT = (function () {
    'use strict';

    function array_to_object(array, value) {

// Make an object from an array of keys and a common value.

        var i, length = array.length, object = Object.create(null);
        for (i = 0; i < length; i += 1) {
            object[array[i]] = value;
        }
        return object;
    }


    var allowed_option = {
            ass       : true,
            bitwise   : true,
            browser   : true,
            closure   : true,
            continue  : true,
            couch     : true,
            debug     : true,
            devel     : true,
            eqeq      : true,
            es5       : true,
            evil      : true,
            forin     : true,
            indent    :   10,
            maxerr    : 1000,
            maxlen    :  256,
            newcap    : true,
            node      : true,
            nomen     : true,
            passfail  : true,
            plusplus  : true,
            properties: true,
            regexp    : true,
            rhino     : true,
            unparam   : true,
            sloppy    : true,
            stupid    : true,
            sub       : true,
            todo      : true,
            vars      : true,
            white     : true
        },
        anonname,       // The guessed name for anonymous functions.

// These are operators that should not be used with the ! operator.

        bang = {
            '<'  : true,
            '<=' : true,
            '==' : true,
            '===': true,
            '!==': true,
            '!=' : true,
            '>'  : true,
            '>=' : true,
            '+'  : true,
            '-'  : true,
            '*'  : true,
            '/'  : true,
            '%'  : true
        },
        begin,          // The root token
        block_var,     // vars defined in the current block

// browser contains a set of global names that are commonly provided by a
// web browser environment.

        browser = array_to_object([
            'clearInterval', 'clearTimeout', 'document', 'event', 'FormData',
            'frames', 'history', 'Image', 'localStorage', 'location', 'name',
            'navigator', 'Option', 'parent', 'screen', 'sessionStorage',
            'setInterval', 'setTimeout', 'Storage', 'window', 'XMLHttpRequest'
        ], false),

// bundle contains the text messages.

        bundle = {
            a_label: "'{a}' is a statement label.",
            a_scope: "'{a}' used out of scope.",
            already_defined: "'{a}' is already defined.",
            and: "The '&&' subexpression should be wrapped in parens.",
            assignment_expression: "Unexpected assignment expression.",
            assignment_function_expression: "Expected an assignment or " +
                "function call and instead saw an expression.",
            avoid_a: "Avoid '{a}'.",
            bad_assignment: "Bad assignment.",
            bad_constructor: "Bad constructor.",
            bad_in_a: "Bad for in variable '{a}'.",
            bad_invocation: "Bad invocation.",
            bad_new: "Do not use 'new' for side effects.",
            bad_number: "Bad number '{a}'.",
            bad_operand: "Bad operand.",
            bad_wrap: "Do not wrap function literals in parens unless they " +
                "are to be immediately invoked.",
            combine_var: "Combine this with the previous 'var' statement.",
            conditional_assignment: "Expected a conditional expression and " +
                "instead saw an assignment.",
            confusing_a: "Confusing use of '{a}'.",
            confusing_regexp: "Confusing regular expression.",
            constructor_name_a: "A constructor name '{a}' should start with " +
                "an uppercase letter.",
            control_a: "Unexpected control character '{a}'.",
            dangling_a: "Unexpected dangling '_' in '{a}'.",
            deleted: "Only properties should be deleted.",
            duplicate_a: "Duplicate '{a}'.",
            empty_block: "Empty block.",
            empty_case: "Empty case.",
            empty_class: "Empty class.",
            es5: "This is an ES5 feature.",
            evil: "eval is evil.",
            expected_a_b: "Expected '{a}' and instead saw '{b}'.",
            expected_a_b_from_c_d: "Expected '{a}' to match '{b}' from line " +
                "{c} and instead saw '{d}'.",
            expected_a_at_b_c: "Expected '{a}' at column {b}, not column {c}.",
            expected_id_a: "Expected an id, and instead saw #{a}.",
            expected_identifier_a: "Expected an identifier and instead saw '{a}'.",
            expected_identifier_a_reserved: "Expected an identifier and " +
                "instead saw '{a}' (a reserved word).",
            expected_number_a: "Expected a number and instead saw '{a}'.",
            expected_operator_a: "Expected an operator and instead saw '{a}'.",
            expected_positive_a: "Expected a positive number and instead saw '{a}'",
            expected_small_a: "Expected a small positive integer and instead saw '{a}'",
            expected_space_a_b: "Expected exactly one space between '{a}' and '{b}'.",
            expected_string_a: "Expected a string and instead saw '{a}'.",
            for_if: "The body of a for in should be wrapped in an if " +
                "statement to filter unwanted properties from the prototype.",
            function_block: "Function statements should not be placed in blocks." +
                "Use a function expression or move the statement to the top of " +
                "the outer function.",
            function_eval: "The Function constructor is eval.",
            function_loop: "Don't make functions within a loop.",
            function_statement: "Function statements are not invocable. " +
                "Wrap the whole function invocation in parens.",
            function_strict: "Use the function form of 'use strict'.",
            identifier_function: "Expected an identifier in an assignment " +
                "and instead saw a function invocation.",
            implied_evil: "Implied eval is evil. Pass a function instead of a string.",
            infix_in: "Unexpected 'in'. Compare with undefined, or use the " +
                "hasOwnProperty method instead.",
            insecure_a: "Insecure '{a}'.",
            isNaN: "Use the isNaN function to compare with NaN.",
            leading_decimal_a: "A leading decimal point can be confused with a dot: '.{a}'.",
            missing_a: "Missing '{a}'.",
            missing_a_after_b: "Missing '{a}' after '{b}'.",
            missing_property: "Missing property name.",
            missing_space_a_b: "Missing space between '{a}' and '{b}'.",
            missing_use_strict: "Missing 'use strict' statement.",
            move_invocation: "Move the invocation into the parens that " +
                "contain the function.",
            move_var: "Move 'var' declarations to the top of the function.",
            name_function: "Missing name in function statement.",
            nested_comment: "Nested comment.",
            not: "Nested not.",
            not_a_constructor: "Do not use {a} as a constructor.",
            not_a_defined: "'{a}' has not been fully defined yet.",
            not_a_function: "'{a}' is not a function.",
            not_a_label: "'{a}' is not a label.",
            not_a_scope: "'{a}' is out of scope.",
            not_greater: "'{a}' should not be greater than '{b}'.",
            octal_a: "Don't use octal: '{a}'. Use '\\u....' instead.",
            parameter_arguments_a: "Do not mutate parameter '{a}' when using 'arguments'.",
            parameter_a_get_b: "Unexpected parameter '{a}' in get {b} function.",
            parameter_set_a: "Expected parameter (value) in set {a} function.",
            radix: "Missing radix parameter.",
            read_only: "Read only.",
            reserved_a: "Reserved name '{a}'.",
            scanned_a_b: "{a} ({b}% scanned).",
            slash_equal: "A regular expression literal can be confused with '/='.",
            statement_block: "Expected to see a statement and instead saw a block.",
            stopping: "Stopping.",
            strange_loop: "Strange loop.",
            strict: "Strict violation.",
            subscript: "['{a}'] is better written in dot notation.",
            sync_a: "Unexpected sync method: '{a}'.",
            tag_a_in_b: "A '<{a}>' must be within '<{b}>'.",
            todo_comment: "Unexpected TODO comment.",
            too_long: "Line too long.",
            too_many: "Too many errors.",
            trailing_decimal_a: "A trailing decimal point can be confused " +
                "with a dot: '.{a}'.",
            unclosed: "Unclosed string.",
            unclosed_comment: "Unclosed comment.",
            unclosed_regexp: "Unclosed regular expression.",
            unescaped_a: "Unescaped '{a}'.",
            unexpected_a: "Unexpected '{a}'.",
            unexpected_char_a: "Unexpected character '{a}'.",
            unexpected_comment: "Unexpected comment.",
            unexpected_label_a: "Unexpected label '{a}'.",
            unexpected_property_a: "Unexpected /*property*/ '{a}'.",
            unexpected_space_a_b: "Unexpected space between '{a}' and '{b}'.",
            unexpected_typeof_a: "Unexpected 'typeof'. " +
                "Use '===' to compare directly with {a}.",
            uninitialized_a: "Uninitialized '{a}'.",
            unnecessary_else: "Unnecessary 'else' after disruption.",
            unnecessary_initialize: "It is not necessary to initialize '{a}' " +
                "to 'undefined'.",
            unnecessary_use: "Unnecessary 'use strict'.",
            unreachable_a_b: "Unreachable '{a}' after '{b}'.",
            unsafe: "Unsafe character.",
            unused_a: "Unused '{a}'.",
            url: "JavaScript URL.",
            use_array: "Use the array literal notation [].",
            use_braces: "Spaces are hard to count. Use {{a}}.",
            use_object: "Use the object literal notation {} or Object.create(null).",
            use_or: "Use the || operator.",
            use_param: "Use a named parameter.",
            use_spaces: "Use spaces, not tabs.",
            used_before_a: "'{a}' was used before it was defined.",
            var_a_not: "Variable {a} was not declared correctly.",
            var_loop: "Don't declare variables in a loop.",
            weird_assignment: "Weird assignment.",
            weird_condition: "Weird condition.",
            weird_new: "Weird construction. Delete 'new'.",
            weird_program: "Weird program.",
            weird_relation: "Weird relation.",
            weird_ternary: "Weird ternary.",
            wrap_immediate: "Wrap an immediate function invocation in " +
                "parentheses to assist the reader in understanding that the " +
                "expression is the result of a function, and not the " +
                "function itself.",
            wrap_regexp: "Wrap the /regexp/ literal in parens to " +
                "disambiguate the slash operator.",
            write_is_wrong: "document.write can be a form of eval."
        },
        closure = array_to_object([
            'goog'
        ], false),
        comments,
        comments_off,
        couch = array_to_object([
            'emit', 'getRow', 'isArray', 'log', 'provides', 'registerType',
            'require', 'send', 'start', 'sum', 'toJSON'
        ], false),

        descapes = {
            'b': '\b',
            't': '\t',
            'n': '\n',
            'f': '\f',
            'r': '\r',
            '"': '"',
            '/': '/',
            '\\': '\\',
            '!': '!'
        },

        devel = array_to_object([
            'alert', 'confirm', 'console', 'Debug', 'opera', 'prompt', 'WSH'
        ], false),
        directive,
        escapes = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '\'': '\\\'',
            '"' : '\\"',
            '/' : '\\/',
            '\\': '\\\\'
        },

        funct,          // The current function

        functions,      // All of the functions
        global_funct,   // The global body
        global_scope,   // The global scope
        in_block,       // Where function statements are not allowed
        indent,
        itself,         // JSLINT itself
        json_mode,
        lex,            // the tokenizer
        lines,
        lookahead,
        node = array_to_object([
            'Buffer', 'clearImmediate', 'clearInterval', 'clearTimeout',
            'console', 'exports', 'global', 'module', 'process', 'querystring',
            'require', 'setImmediate', 'setInterval', 'setTimeout',
            '__dirname', '__filename'
        ], false),
        node_js,
        numbery = array_to_object(['indexOf', 'lastIndexOf', 'search'], true),
        next_token,
        option,
        predefined,     // Global variables defined by option
        prereg,
        prev_token,
        property,
        protosymbol,
        regexp_flag = array_to_object(['g', 'i', 'm'], true),
        return_this = function return_this() {
            return this;
        },
        rhino = array_to_object([
            'defineClass', 'deserialize', 'gc', 'help', 'load', 'loadClass',
            'print', 'quit', 'readFile', 'readUrl', 'runCommand', 'seal',
            'serialize', 'spawn', 'sync', 'toint32', 'version'
        ], false),

        scope,      // An object containing an object for each variable in scope
        semicolon_coda = array_to_object([';', '"', '\'', ')'], true),

// standard contains the global names that are provided by the
// ECMAScript standard.

        standard = array_to_object([
            'Array', 'Boolean', 'Date', 'decodeURI', 'decodeURIComponent',
            'encodeURI', 'encodeURIComponent', 'Error', 'eval', 'EvalError',
            'Function', 'isFinite', 'isNaN', 'JSON', 'Math', 'Number',
            'Object', 'parseInt', 'parseFloat', 'RangeError', 'ReferenceError',
            'RegExp', 'String', 'SyntaxError', 'TypeError', 'URIError'
        ], false),

        strict_mode,
        syntax = Object.create(null),
        token,
        tokens,
        var_mode,
        warnings,

// Regular expressions. Some of these are stupidly long.

// carriage return, carriage return linefeed, or linefeed
        crlfx = /\r\n?|\n/,
// unsafe characters that are silently deleted by one or more browsers
        cx = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/,
// identifier
        ix = /^([a-zA-Z_$][a-zA-Z0-9_$]*)$/,
// javascript url
        jx = /^(?:javascript|jscript|ecmascript|vbscript)\s*:/i,
// star slash
        lx = /\*\/|\/\*/,
// characters in strings that need escapement
        nx = /[\u0000-\u001f'\\\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
// sync
        syx = /Sync$/,
// comment todo
        tox = /^\W*to\s*do(?:\W|$)/i,
// token
        tx = /^\s*([(){}\[\]\?.,:;'"~#@`]|={1,3}|\/(\*(jslint|properties|property|members?|globals?)?|=|\/)?|\*[\/=]?|\+(?:=|\++)?|-(?:=|-+)?|[\^%]=?|&[&=]?|\|[|=]?|>{1,3}=?|<(?:[\/=!]|\!(\[|--)?|<=?)?|\!(\!|==?)?|[a-zA-Z_$][a-zA-Z0-9_$]*|[0-9]+(?:[xX][0-9a-fA-F]+|\.[0-9]*)?(?:[eE][+\-]?[0-9]+)?)/;


    if (typeof String.prototype.entityify !== 'function') {
        String.prototype.entityify = function () {
            return this
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };
    }

    if (typeof String.prototype.isAlpha !== 'function') {
        String.prototype.isAlpha = function () {
            return (this >= 'a' && this <= 'z\uffff') ||
                (this >= 'A' && this <= 'Z\uffff');
        };
    }

    if (typeof String.prototype.isDigit !== 'function') {
        String.prototype.isDigit = function () {
            return (this >= '0' && this <= '9');
        };
    }

    if (typeof String.prototype.supplant !== 'function') {
        String.prototype.supplant = function (o) {
            return this.replace(/\{([^{}]*)\}/g, function (a, b) {
                var replacement = o[b];
                return typeof replacement === 'string' ||
                    typeof replacement === 'number' ? replacement : a;
            });
        };
    }


    function sanitize(a) {

//  Escapify a troublesome character.

        return escapes[a] ||
            '\\u' + ('0000' + a.charCodeAt().toString(16)).slice(-4);
    }


    function add_to_predefined(group) {
        Object.keys(group).forEach(function (name) {
            predefined[name] = group[name];
        });
    }


    function assume() {
        if (option.browser) {
            add_to_predefined(browser);
            option.browser = false;
        }
        if (option.closure) {
            add_to_predefined(closure);
        }
        if (option.couch) {
            add_to_predefined(couch);
            option.couch = false;
            option.es5 = true;
        }
        if (option.devel) {
            add_to_predefined(devel);
            option.devel = false;
        }
        if (option.node) {
            add_to_predefined(node);
            option.node = false;
            option.es5 = true;
            node_js = true;
        }
        if (option.rhino) {
            add_to_predefined(rhino);
            option.rhino = false;
        }
    }


// Produce an error warning.

    function artifact(tok) {
        if (!tok) {
            tok = next_token;
        }
        return tok.id === '(number)' ? tok.number : tok.string;
    }

    function quit(message, line, character) {
        throw {
            name: 'JSLintError',
            line: line,
            character: character,
            message: bundle.scanned_a_b.supplant({
                a: bundle[message] || message,
                b: Math.floor((line / lines.length) * 100)
            })
        };
    }

    function warn(code, line, character, a, b, c, d) {
        var warning = {         // ~~
            id: '(error)',
            raw: bundle[code] || code,
            code: code,
            evidence: lines[line - 1] || '',
            line: line,
            character: character,
            a: a || artifact(this),
            b: b,
            c: c,
            d: d
        };
        warning.reason = warning.raw.supplant(warning);
        itself.errors.push(warning);
        if (option.passfail) {
            quit('stopping', line, character);
        }
        warnings += 1;
        if (warnings >= option.maxerr) {
            quit('too_many', line, character);
        }
        return warning;
    }

    function stop(code, line, character, a, b, c, d) {
        var warning = warn(code, line, character, a, b, c, d);
        quit('stopping', warning.line, warning.character);
    }

    function expected_at(at) {
        if (!option.white && next_token.from !== at) {
            next_token.warn('expected_a_at_b_c', '', at, next_token.from);
        }
    }

// lexical analysis and token construction

    lex = (function lex() {
        var character, c, from, length, line, pos, source_row;

// Private lex methods

        function next_line() {
            var at;
            character = 1;
            source_row = lines[line];
            line += 1;
            if (source_row === undefined) {
                return false;
            }
            at = source_row.search(/\t/);
            if (at >= 0) {
                if (option.white) {
                    source_row = source_row.replace(/\t/g, ' ');
                } else {
                    warn('use_spaces', line, at + 1);
                }
            }
            at = source_row.search(cx);
            if (at >= 0) {
                warn('unsafe', line, at);
            }
            if (option.maxlen && option.maxlen < source_row.length) {
                warn('too_long', line, source_row.length);
            }
            return true;
        }

// Produce a token object.  The token inherits from a syntax symbol.

        function it(type, value) {
            var id, the_token;
            if (type === '(string)') {
                if (jx.test(value)) {
                    warn('url', line, from);
                }
            }
            the_token = Object.create(syntax[(
                type === '(punctuator)' || (type === '(identifier)' &&
                        Object.prototype.hasOwnProperty.call(syntax, value))
                    ? value
                    : type
            )] || syntax['(error)']);
            if (type === '(identifier)') {
                the_token.identifier = true;
                if (value === '__iterator__' || value === '__proto__') {
                    stop('reserved_a', line, from, value);
                } else if (!option.nomen &&
                        (value.charAt(0) === '_' ||
                        value.charAt(value.length - 1) === '_')) {
                    warn('dangling_a', line, from, value);
                }
            }
            if (type === '(number)') {
                the_token.number = +value;
            } else if (value !== undefined) {
                the_token.string = String(value);
            }
            the_token.line = line;
            the_token.from = from;
            the_token.thru = character;
            if (comments.length) {
                the_token.comments = comments;
                comments = [];
            }
            id = the_token.id;
            prereg = id && (
                ('(,=:[!&|?{};~+-*%^<>'.indexOf(id.charAt(id.length - 1)) >= 0) ||
                id === 'return' || id === 'case'
            );
            return the_token;
        }

        function match(x) {
            var exec = x.exec(source_row), first;
            if (exec) {
                length = exec[0].length;
                first = exec[1];
                c = first.charAt(0);
                source_row = source_row.slice(length);
                from = character + length - first.length;
                character += length;
                return first;
            }
            for (;;) {
                if (!source_row) {
                    if (!option.white) {
                        warn('unexpected_char_a', line, character - 1, '(space)');
                    }
                    return;
                }
                c = source_row.charAt(0);
                if (c !== ' ') {
                    break;
                }
                source_row = source_row.slice(1);
                character += 1;
            }
            stop('unexpected_char_a', line, character, c);

        }

        function string(x) {
            var c, pos = 0, r = '', result;

            function hex(n) {
                var i = parseInt(source_row.substr(pos + 1, n), 16);
                pos += n;
                if (i >= 32 && i <= 126 &&
                        i !== 34 && i !== 92 && i !== 39) {
                    warn('unexpected_a', line, character, '\\');
                }
                character += n;
                c = String.fromCharCode(i);
            }

            if (json_mode && x !== '"') {
                warn('expected_a_b', line, character, '"', x);
            }

            for (;;) {
                while (pos >= source_row.length) {
                    pos = 0;
                    if (!next_line()) {
                        stop('unclosed', line - 1, from);
                    }
                }
                c = source_row.charAt(pos);
                if (c === x) {
                    character += 1;
                    source_row = source_row.slice(pos + 1);
                    result = it('(string)', r);
                    result.quote = x;
                    return result;
                }
                if (c < ' ') {
                    if (c === '\n' || c === '\r') {
                        break;
                    }
                    warn('control_a', line, character + pos,
                        source_row.slice(0, pos));
                } else if (c === '\\') {
                    pos += 1;
                    character += 1;
                    c = source_row.charAt(pos);
                    switch (c) {
                    case '':
                        if (!option.es5) {
                            warn('es5', line, character);
                        }
                        next_line();
                        pos = -1;
                        break;
                    case '\'':
                        if (json_mode) {
                            warn('unexpected_a', line, character, '\\\'');
                        }
                        break;
                    case 'u':
                        hex(4);
                        break;
                    case 'v':
                        if (json_mode) {
                            warn('unexpected_a', line, character, '\\v');
                        }
                        c = '\v';
                        break;
                    case 'x':
                        if (json_mode) {
                            warn('unexpected_a', line, character, '\\x');
                        }
                        hex(2);
                        break;
                    default:
                        if (typeof descapes[c] !== 'string') {
                            warn(c >= '0' && c <= '7' ? 'octal_a' : 'unexpected_a',
                                line, character, '\\' + c);
                        } else {
                            c = descapes[c];
                        }
                    }
                }
                r += c;
                character += 1;
                pos += 1;
            }
        }

        function number(snippet) {
            var digit;
            if (source_row.charAt(0).isAlpha()) {
                warn('expected_space_a_b',
                    line, character, c, source_row.charAt(0));
            }
            if (c === '0') {
                digit = snippet.charAt(1);
                if (digit.isDigit()) {
                    if (token.id !== '.') {
                        warn('unexpected_a', line, character, snippet);
                    }
                } else if (json_mode && (digit === 'x' || digit === 'X')) {
                    warn('unexpected_a', line, character, '0x');
                }
            }
            if (snippet.slice(snippet.length - 1) === '.') {
                warn('trailing_decimal_a', line, character, snippet);
            }
            digit = +snippet;
            if (!isFinite(digit)) {
                warn('bad_number', line, character, snippet);
            }
            snippet = digit;
            return it('(number)', snippet);
        }

        function comment(snippet, type) {
            if (comments_off) {
                warn('unexpected_comment', line, character);
            } else if (!option.todo && tox.test(snippet)) {
                warn('todo_comment', line, character);
            }
            comments.push({
                id: type,
                from: from,
                thru: character,
                line: line,
                string: snippet
            });
        }

        function regexp() {
            var b,
                bit,
                depth = 0,
                flag = '',
                high,
                letter,
                length = 0,
                low,
                potential,
                quote,
                result;
            for (;;) {
                b = true;
                c = source_row.charAt(length);
                length += 1;
                switch (c) {
                case '':
                    stop('unclosed_regexp', line, from);
                    return;
                case '/':
                    if (depth > 0) {
                        warn('unescaped_a', line, from + length, '/');
                    }
                    c = source_row.slice(0, length - 1);
                    potential = Object.create(regexp_flag);
                    for (;;) {
                        letter = source_row.charAt(length);
                        if (potential[letter] !== true) {
                            break;
                        }
                        potential[letter] = false;
                        length += 1;
                        flag += letter;
                    }
                    if (source_row.charAt(length).isAlpha()) {
                        stop('unexpected_a', line, from, source_row.charAt(length));
                    }
                    character += length;
                    source_row = source_row.slice(length);
                    quote = source_row.charAt(0);
                    if (quote === '/' || quote === '*') {
                        stop('confusing_regexp', line, from);
                    }
                    result = it('(regexp)', c);
                    result.flag = flag;
                    return result;
                case '\\':
                    c = source_row.charAt(length);
                    if (c < ' ') {
                        warn('control_a', line, from + length, String(c));
                    } else if (c === '<') {
                        warn('unexpected_a', line, from + length, '\\');
                    }
                    length += 1;
                    break;
                case '(':
                    depth += 1;
                    b = false;
                    if (source_row.charAt(length) === '?') {
                        length += 1;
                        switch (source_row.charAt(length)) {
                        case ':':
                        case '=':
                        case '!':
                            length += 1;
                            break;
                        default:
                            warn('expected_a_b', line, from + length,
                                ':', source_row.charAt(length));
                        }
                    }
                    break;
                case '|':
                    b = false;
                    break;
                case ')':
                    if (depth === 0) {
                        warn('unescaped_a', line, from + length, ')');
                    } else {
                        depth -= 1;
                    }
                    break;
                case ' ':
                    pos = 1;
                    while (source_row.charAt(length) === ' ') {
                        length += 1;
                        pos += 1;
                    }
                    if (pos > 1) {
                        warn('use_braces', line, from + length, pos);
                    }
                    break;
                case '[':
                    c = source_row.charAt(length);
                    if (c === '^') {
                        length += 1;
                        if (!option.regexp) {
                            warn('insecure_a', line, from + length, c);
                        } else if (source_row.charAt(length) === ']') {
                            stop('unescaped_a', line, from + length, '^');
                        }
                    }
                    bit = false;
                    if (c === ']') {
                        warn('empty_class', line, from + length - 1);
                        bit = true;
                    }
klass:              do {
                        c = source_row.charAt(length);
                        length += 1;
                        switch (c) {
                        case '[':
                        case '^':
                            warn('unescaped_a', line, from + length, c);
                            bit = true;
                            break;
                        case '-':
                            if (bit) {
                                bit = false;
                            } else {
                                warn('unescaped_a', line, from + length, '-');
                                bit = true;
                            }
                            break;
                        case ']':
                            if (!bit) {
                                warn('unescaped_a', line, from + length - 1, '-');
                            }
                            break klass;
                        case '\\':
                            c = source_row.charAt(length);
                            if (c < ' ') {
                                warn('control_a', line, from + length, String(c));
                            } else if (c === '<') {
                                warn('unexpected_a', line, from + length, '\\');
                            }
                            length += 1;
                            bit = true;
                            break;
                        case '/':
                            warn('unescaped_a', line, from + length - 1, '/');
                            bit = true;
                            break;
                        default:
                            bit = true;
                        }
                    } while (c);
                    break;
                case '.':
                    if (!option.regexp) {
                        warn('insecure_a', line, from + length, c);
                    }
                    break;
                case ']':
                case '?':
                case '{':
                case '}':
                case '+':
                case '*':
                    warn('unescaped_a', line, from + length, c);
                    break;
                }
                if (b) {
                    switch (source_row.charAt(length)) {
                    case '?':
                    case '+':
                    case '*':
                        length += 1;
                        if (source_row.charAt(length) === '?') {
                            length += 1;
                        }
                        break;
                    case '{':
                        length += 1;
                        c = source_row.charAt(length);
                        if (c < '0' || c > '9') {
                            warn('expected_number_a', line,
                                from + length, c);
                        }
                        length += 1;
                        low = +c;
                        for (;;) {
                            c = source_row.charAt(length);
                            if (c < '0' || c > '9') {
                                break;
                            }
                            length += 1;
                            low = +c + (low * 10);
                        }
                        high = low;
                        if (c === ',') {
                            length += 1;
                            high = Infinity;
                            c = source_row.charAt(length);
                            if (c >= '0' && c <= '9') {
                                length += 1;
                                high = +c;
                                for (;;) {
                                    c = source_row.charAt(length);
                                    if (c < '0' || c > '9') {
                                        break;
                                    }
                                    length += 1;
                                    high = +c + (high * 10);
                                }
                            }
                        }
                        if (source_row.charAt(length) !== '}') {
                            warn('expected_a_b', line, from + length,
                                '}', c);
                        } else {
                            length += 1;
                        }
                        if (source_row.charAt(length) === '?') {
                            length += 1;
                        }
                        if (low > high) {
                            warn('not_greater', line, from + length,
                                low, high);
                        }
                        break;
                    }
                }
            }
            c = source_row.slice(0, length - 1);
            character += length;
            source_row = source_row.slice(length);
            return it('(regexp)', c);
        }

// Public lex methods

        return {
            init: function (source) {
                if (typeof source === 'string') {
                    lines = source.split(crlfx);
                } else {
                    lines = source;
                }
                line = 0;
                next_line();
                from = 1;
            },

// token -- this is called by advance to get the next token.

            token: function () {
                var c, i, snippet;

                for (;;) {
                    while (!source_row) {
                        if (!next_line()) {
                            return it('(end)');
                        }
                    }
                    snippet = match(tx);
                    if (snippet) {

//      identifier

                        c = snippet.charAt(0);
                        if (c.isAlpha() || c === '_' || c === '$') {
                            return it('(identifier)', snippet);
                        }

//      number

                        if (c.isDigit()) {
                            return number(snippet);
                        }
                        switch (snippet) {

//      string

                        case '"':
                        case "'":
                            return string(snippet);

//      // comment

                        case '//':
                            comment(source_row, '//');
                            source_row = '';
                            break;

//      /* comment

                        case '/*':
                            for (;;) {
                                i = source_row.search(lx);
                                if (i >= 0) {
                                    break;
                                }
                                character = source_row.length;
                                comment(source_row);
                                from = 0;
                                if (!next_line()) {
                                    stop('unclosed_comment', line, character);
                                }
                            }
                            comment(source_row.slice(0, i), '/*');
                            character += i + 2;
                            if (source_row.charAt(i) === '/') {
                                stop('nested_comment', line, character);
                            }
                            source_row = source_row.slice(i + 2);
                            break;

                        case '':
                            break;
//      /
                        case '/':
                            if (token.id === '/=') {
                                stop('slash_equal', line, from);
                            }
                            return prereg
                                ? regexp()
                                : it('(punctuator)', snippet);

//      punctuator
                        default:
                            return it('(punctuator)', snippet);
                        }
                    }
                }
            }
        };
    }());

    function define(kind, token) {

// Define a name.

        var name = token.string,
            master = scope[name];       // The current definition of the name

// vars are created with a deadzone, so that the expression that initializes
// the var cannot access the var. Functions are not writeable.

        token.dead = false;
        token.init = false;
        token.kind = kind;
        token.master = master;
        token.used = 0;
        token.writeable = false;

// Global variables are a little weird. They can be defined multiple times.
// Some predefined global vars are (or should) not be writeable.

        if (kind === 'var' && funct === global_funct) {
            if (!master) {
                if (predefined[name] === false) {
                    token.writeable = false;
                }
                global_scope[name] = token;
            }
        } else {

// It is an error if the name has already been defined in this scope, except
// when reusing an exception variable name.

            if (master && master.function === funct) {
                if (master.kind !== 'exception' || kind !== 'exception' || !master.dead) {
                    token.warn('already_defined', name);
                }
            }
            scope[name] = token;
            if (kind === 'var') {
                block_var.push(name);
            }
        }
    }

    function peek(distance) {

// Peek ahead to a future token. The distance is how far ahead to look. The
// default is the next token.

        var found, slot = 0;

        distance = distance || 0;
        while (slot <= distance) {
            found = lookahead[slot];
            if (!found) {
                found = lookahead[slot] = lex.token();
            }
            slot += 1;
        }
        return found;
    }


    function advance(id, match) {

// Produce the next token, also looking for programming errors.

        if (indent) {

// If indentation checking was requested, then inspect all of the line breakings.
// The var statement is tricky because the names might be aligned or not. We
// look at the first line break after the var to determine the programmer's
// intention.

            if (var_mode && next_token.line !== token.line) {
                if ((var_mode !== indent || !next_token.edge) &&
                        next_token.from === indent.at -
                        (next_token.edge ? option.indent : 0)) {
                    var dent = indent;
                    for (;;) {
                        dent.at -= option.indent;
                        if (dent === var_mode) {
                            break;
                        }
                        dent = dent.was;
                    }
                    dent.open = false;
                }
                var_mode = null;
            }
            if (next_token.id === '?' && indent.mode === ':' &&
                    token.line !== next_token.line) {
                indent.at -= option.indent;
            }
            if (indent.open) {

// If the token is an edge.

                if (next_token.edge) {
                    if (next_token.edge === 'label') {
                        expected_at(1);
                    } else if (next_token.edge === 'case' || indent.mode === 'statement') {
                        expected_at(indent.at - option.indent);
                    } else if (indent.mode !== 'array' || next_token.line !== token.line) {
                        expected_at(indent.at);
                    }

// If the token is not an edge, but is the first token on the line.

                } else if (next_token.line !== token.line) {
                    if (next_token.from < indent.at + (indent.mode ===
                            'expression' ? 0 : option.indent)) {
                        expected_at(indent.at + option.indent);
                    }
                    indent.wrap = true;
                }
            } else if (next_token.line !== token.line) {
                if (next_token.edge) {
                    expected_at(indent.at);
                } else {
                    indent.wrap = true;
                    if (indent.mode === 'statement' || indent.mode === 'var') {
                        expected_at(indent.at + option.indent);
                    } else if (next_token.from < indent.at + (indent.mode ===
                            'expression' ? 0 : option.indent)) {
                        expected_at(indent.at + option.indent);
                    }
                }
            }
        }

        switch (token.id) {
        case '(number)':
            if (next_token.id === '.') {
                next_token.warn('trailing_decimal_a');
            }
            break;
        case '-':
            if (next_token.id === '-' || next_token.id === '--') {
                next_token.warn('confusing_a');
            }
            break;
        case '+':
            if (next_token.id === '+' || next_token.id === '++') {
                next_token.warn('confusing_a');
            }
            break;
        }
        if (token.id === '(string)' || token.identifier) {
            anonname = token.string;
        }

        if (id && next_token.id !== id) {
            if (match) {
                next_token.warn('expected_a_b_from_c_d', id,
                    match.id, match.line, artifact());
            } else if (!next_token.identifier || next_token.string !== id) {
                next_token.warn('expected_a_b', id, artifact());
            }
        }
        prev_token = token;
        token = next_token;
        next_token = lookahead.shift() || lex.token();
        next_token.function = funct;
        tokens.push(next_token);
    }


    function do_globals() {
        var name, writeable;
        for (;;) {
            if (next_token.id !== '(string)' && !next_token.identifier) {
                return;
            }
            name = next_token.string;
            advance();
            writeable = false;
            if (next_token.id === ':') {
                advance(':');
                switch (next_token.id) {
                case 'true':
                    writeable = predefined[name] !== false;
                    advance('true');
                    break;
                case 'false':
                    advance('false');
                    break;
                default:
                    next_token.stop('unexpected_a');
                }
            }
            predefined[name] = writeable;
            if (next_token.id !== ',') {
                return;
            }
            advance(',');
        }
    }


    function do_jslint() {
        var name, value;
        while (next_token.id === '(string)' || next_token.identifier) {
            name = next_token.string;
            if (!allowed_option[name]) {
                next_token.stop('unexpected_a');
            }
            advance();
            if (next_token.id !== ':') {
                next_token.stop('expected_a_b', ':', artifact());
            }
            advance(':');
            if (typeof allowed_option[name] === 'number') {
                value = next_token.number;
                if (value > allowed_option[name] || value <= 0 ||
                        Math.floor(value) !== value) {
                    next_token.stop('expected_small_a');
                }
                option[name] = value;
            } else {
                if (next_token.id === 'true') {
                    option[name] = true;
                } else if (next_token.id === 'false') {
                    option[name] = false;
                } else {
                    next_token.stop('unexpected_a');
                }
            }
            advance();
            if (next_token.id === ',') {
                advance(',');
            }
        }
        assume();
    }


    function do_properties() {
        var name;
        option.properties = true;
        for (;;) {
            if (next_token.id !== '(string)' && !next_token.identifier) {
                return;
            }
            name = next_token.string;
            advance();
            if (next_token.id === ':') {
                for (;;) {
                    advance();
                    if (next_token.id !== '(string)' && !next_token.identifier) {
                        break;
                    }
                }
            }
            property[name] = 0;
            if (next_token.id !== ',') {
                return;
            }
            advance(',');
        }
    }


    directive = function directive() {
        var command = this.id,
            old_comments_off = comments_off,
            old_indent = indent;
        comments_off = true;
        indent = null;
        if (next_token.line === token.line && next_token.from === token.thru) {
            next_token.warn('missing_space_a_b', artifact(token), artifact());
        }
        if (lookahead.length > 0) {
            this.warn('unexpected_a');
        }
        switch (command) {
        case '/*properties':
        case '/*property':
        case '/*members':
        case '/*member':
            do_properties();
            break;
        case '/*jslint':
            do_jslint();
            break;
        case '/*globals':
        case '/*global':
            do_globals();
            break;
        default:
            this.stop('unexpected_a');
        }
        comments_off = old_comments_off;
        advance('*/');
        indent = old_indent;
    };


// Indentation intention

    function edge(mode) {
        next_token.edge = indent ? indent.open && (mode || 'edge') : '';
    }


    function step_in(mode) {
        var open;
        if (typeof mode === 'number') {
            indent = {
                at: +mode,
                open: true,
                was: indent
            };
        } else if (!indent) {
            indent = {
                at: 1,
                mode: 'statement',
                open: true
            };
        } else if (mode === 'statement') {
            indent = {
                at: indent.at,
                open: true,
                was: indent
            };
        } else {
            open = mode === 'var' || next_token.line !== token.line;
            indent = {
                at: (open || mode === 'control'
                    ? indent.at + option.indent
                    : indent.at) + (indent.wrap ? option.indent : 0),
                mode: mode,
                open: open,
                was: indent
            };
            if (mode === 'var' && open) {
                var_mode = indent;
            }
        }
    }

    function step_out(id, symbol) {
        if (id) {
            if (indent && indent.open) {
                indent.at -= option.indent;
                edge();
            }
            advance(id, symbol);
        }
        if (indent) {
            indent = indent.was;
        }
    }

// Functions for conformance of whitespace.

    function one_space(left, right) {
        left = left || token;
        right = right || next_token;
        if (right.id !== '(end)' && !option.white &&
                (token.line !== right.line ||
                token.thru + 1 !== right.from)) {
            right.warn('expected_space_a_b', artifact(token), artifact(right));
        }
    }

    function one_space_only(left, right) {
        left = left || token;
        right = right || next_token;
        if (right.id !== '(end)' && (left.line !== right.line ||
                (!option.white && left.thru + 1 !== right.from))) {
            right.warn('expected_space_a_b', artifact(left), artifact(right));
        }
    }

    function no_space(left, right) {
        left = left || token;
        right = right || next_token;
        if ((!option.white) &&
                left.thru !== right.from && left.line === right.line) {
            right.warn('unexpected_space_a_b', artifact(left), artifact(right));
        }
    }

    function no_space_only(left, right) {
        left = left || token;
        right = right || next_token;
        if (right.id !== '(end)' && (left.line !== right.line ||
                (!option.white && left.thru !== right.from))) {
            right.warn('unexpected_space_a_b', artifact(left), artifact(right));
        }
    }

    function spaces(left, right) {
        if (!option.white) {
            left = left || token;
            right = right || next_token;
            if (left.thru === right.from && left.line === right.line) {
                right.warn('missing_space_a_b', artifact(left), artifact(right));
            }
        }
    }

    function comma() {
        if (next_token.id !== ',') {
            warn('expected_a_b', token.line, token.thru, ',', artifact());
        } else {
            if (!option.white) {
                no_space_only();
            }
            advance(',');
            spaces();
        }
    }


    function semicolon() {
        if (next_token.id !== ';') {
            warn('expected_a_b', token.line, token.thru, ';', artifact());
        } else {
            if (!option.white) {
                no_space_only();
            }
            advance(';');
            if (semicolon_coda[next_token.id] !== true) {
                spaces();
            }
        }
    }

    function use_strict() {
        if (next_token.string === 'use strict') {
            if (strict_mode) {
                next_token.warn('unnecessary_use');
            }
            edge();
            advance();
            semicolon();
            strict_mode = true;
            return true;
        }
        return false;
    }


    function are_similar(a, b) {
        if (a === b) {
            return true;
        }
        if (Array.isArray(a)) {
            if (Array.isArray(b) && a.length === b.length) {
                var i;
                for (i = 0; i < a.length; i += 1) {
                    if (!are_similar(a[i], b[i])) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        }
        if (Array.isArray(b)) {
            return false;
        }
        if (a.id === '(number)' && b.id === '(number)') {
            return a.number === b.number;
        }
        if (a.arity === 'function' || b.arity === 'function') {
            return false;
        }
        if (a.identifier && b.identifier) {
            return a.string === b.string;
        }
        if (a.arity === b.arity && a.string === b.string) {
            switch (a.arity) {
            case 'prefix':
            case 'suffix':
            case undefined:
                return a.id === b.id && are_similar(a.first, b.first) &&
                    a.id !== '{' && a.id !== '[';
            case 'infix':
                return are_similar(a.first, b.first) &&
                    are_similar(a.second, b.second);
            case 'ternary':
                return are_similar(a.first, b.first) &&
                    are_similar(a.second, b.second) &&
                    are_similar(a.third, b.third);
            case 'function':
            case 'regexp':
                return false;
            default:
                return true;
            }
        }
        if (a.id === '.' && b.id === '[' && b.arity === 'infix') {
            return a.second.string === b.second.string && b.second.id === '(string)';
        }
        if (a.id === '[' && a.arity === 'infix' && b.id === '.') {
            return a.second.string === b.second.string && a.second.id === '(string)';
        }
        return false;
    }


// This is the heart of JSLINT, the Pratt parser. In addition to parsing, it
// is looking for ad hoc lint patterns. We add .fud to Pratt's model, which is
// like .nud except that it is only used on the first token of a statement.
// Having .fud makes it much easier to define statement-oriented languages like
// JavaScript. I retained Pratt's nomenclature.

// .nud     Null denotation
// .fud     First null denotation
// .led     Left denotation
//  lbp     Left binding power
//  rbp     Right binding power

// They are elements of the parsing method called Top Down Operator Precedence.

    function expression(rbp, initial) {

// rbp is the right binding power.
// initial indicates that this is the first expression of a statement.

        var left;
        if (next_token.id === '(end)') {
            token.stop('unexpected_a', next_token.id);
        }
        advance();
        if (initial) {
            anonname = 'anonymous';
        }
        if (initial === true && token.fud) {
            left = token.fud();
        } else {
            if (token.nud) {
                left = token.nud();
            } else {
                if (next_token.id === '(number)' && token.id === '.') {
                    token.warn('leading_decimal_a', artifact());
                    advance();
                    return token;
                }
                token.stop('expected_identifier_a', artifact(token));
            }
            while (rbp < next_token.lbp) {
                advance();
                left = token.led(left);
            }
        }
        if (left && left.assign && !initial) {
            if (!option.ass) {
                left.warn('assignment_expression');
            }
            if (left.id !== '=' && left.first.master) {
                left.first.master.used = true;
            }
        }
        return left;
    }

    protosymbol = {
        nud: function () {
            this.stop('unexpected_a');
        },
        led: function () {
            this.stop('expected_operator_a');
        },
        warn: function (code, a, b, c, d) {
            if (!this.warning) {
                this.warning = warn(code, this.line || 0, this.from || 0,
                    a || artifact(this), b, c, d);
            }
        },
        stop: function (code, a, b, c, d) {
            this.warning = undefined;
            this.warn(code, a, b, c, d);
            return quit('stopping', this.line, this.character);
        },
        lbp: 0
    };

// Functional constructors for making the symbols that will be inherited by
// tokens.

    function symbol(s, bp) {
        var x = syntax[s];
        if (!x) {
            x = Object.create(protosymbol);
            x.id = x.string = s;
            x.lbp = bp || 0;
            syntax[s] = x;
        }
        return x;
    }

    function postscript(x) {
        x.postscript = true;
        return x;
    }

    function ultimate(s) {
        var x = symbol(s, 0);
        x.from = 1;
        x.thru = 1;
        x.line = 0;
        x.edge = 'edge';
        x.string = s;
        return postscript(x);
    }

    function reserve_name(x) {
        var c = x.id.charAt(0);
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
            x.identifier = x.reserved = true;
        }
        return x;
    }

    function stmt(s, f) {
        var x = symbol(s);
        x.fud = f;
        return reserve_name(x);
    }

    function disrupt_stmt(s, f) {
        var x = stmt(s, f);
        x.disrupt = true;
    }

    function labeled_stmt(s, f) {
        var x = stmt(s, f);
        x.labeled = true;
    }

    function prefix(s, f) {
        var x = symbol(s, 150);
        reserve_name(x);
        x.nud = function () {
            var that = this;
            that.arity = 'prefix';
            if (typeof f === 'function') {
                that = f(that);
                if (that.arity !== 'prefix') {
                    return that;
                }
            } else {
                if (s === 'typeof') {
                    one_space();
                } else {
                    no_space_only();
                }
                that.first = expression(150);
            }
            switch (that.id) {
            case '++':
            case '--':
                if (!option.plusplus) {
                    that.warn('unexpected_a');
                } else if ((!that.first.identifier || that.first.reserved) &&
                        that.first.id !== '.' && that.first.id !== '[') {
                    that.warn('bad_operand');
                }
                break;
            default:
                if (that.first.arity === 'prefix' ||
                        that.first.arity === 'function') {
                    that.warn('unexpected_a');
                }
            }
            return that;
        };
        return x;
    }


    function type(s, t, nud) {
        var x = symbol(s);
        x.arity = t;
        if (nud) {
            x.nud = nud;
        }
        return x;
    }


    function reserve(s, f) {
        var x = symbol(s);
        x.identifier = x.reserved = true;
        if (typeof f === 'function') {
            x.nud = f;
        }
        return x;
    }


    function constant(name) {
        var x = reserve(name);
        x.string = name;
        x.nud = return_this;
        return x;
    }


    function reservevar(s, v) {
        return reserve(s, function () {
            if (typeof v === 'function') {
                v(this);
            }
            return this;
        });
    }


    function infix(s, p, f, w) {
        var x = symbol(s, p);
        reserve_name(x);
        x.led = function (left) {
            this.arity = 'infix';
            if (!w) {
                spaces(prev_token, token);
                spaces();
            }
            if (!option.bitwise && this.bitwise) {
                this.warn('unexpected_a');
            }
            if (typeof f === 'function') {
                return f(left, this);
            }
            this.first = left;
            this.second = expression(p);
            return this;
        };
        return x;
    }

    function expected_relation(node, message) {
        if (node.assign) {
            node.warn(message || 'conditional_assignment');
        }
        return node;
    }

    function expected_condition(node, message) {
        switch (node.id) {
        case '[':
        case '-':
            if (node.arity !== 'infix') {
                node.warn(message || 'weird_condition');
            }
            break;
        case 'false':
        case 'function':
        case 'Infinity':
        case 'NaN':
        case 'null':
        case 'true':
        case 'undefined':
        case 'void':
        case '(number)':
        case '(regexp)':
        case '(string)':
        case '{':
        case '?':
        case '~':
            node.warn(message || 'weird_condition');
            break;
        case '(':
            if (node.first.id === 'new' ||
                    (node.first.string === 'Boolean') ||
                    (node.first.id === '.' &&
                        numbery[node.first.second.string] === true)) {
                node.warn(message || 'weird_condition');
            }
            break;
        }
        return node;
    }

    function check_relation(node) {
        switch (node.arity) {
        case 'prefix':
            switch (node.id) {
            case '{':
            case '[':
                node.warn('unexpected_a');
                break;
            case '!':
                node.warn('confusing_a');
                break;
            }
            break;
        case 'function':
        case 'regexp':
            node.warn('unexpected_a');
            break;
        default:
            if (node.id  === 'NaN') {
                node.warn('isNaN');
            } else if (node.relation) {
                node.warn('weird_relation');
            }
        }
        return node;
    }


    function relation(s, eqeq) {
        var x = infix(s, 100, function (left, that) {
            check_relation(left);
            if (eqeq && !option.eqeq) {
                that.warn('expected_a_b', eqeq, that.id);
            }
            var right = expression(100);
            if (are_similar(left, right) ||
                    ((left.id === '(string)' || left.id === '(number)') &&
                    (right.id === '(string)' || right.id === '(number)'))) {
                that.warn('weird_relation');
            } else if (left.id === 'typeof') {
                if (right.id !== '(string)') {
                    right.warn("expected_string_a", artifact(right));
                } else if (right.string === 'undefined' ||
                        right.string === 'null') {
                    left.warn("unexpected_typeof_a", right.string);
                }
            } else if (right.id === 'typeof') {
                if (left.id !== '(string)') {
                    left.warn("expected_string_a", artifact(left));
                } else if (left.string === 'undefined' ||
                        left.string === 'null') {
                    right.warn("unexpected_typeof_a", left.string);
                }
            }
            that.first = left;
            that.second = check_relation(right);
            return that;
        });
        x.relation = true;
        return x;
    }

    function lvalue(that, s) {
        var master;
        if (that.identifier) {
            master = scope[that.string];
            if (master) {
                if (scope[that.string].writeable !== true) {
                    that.warn('read_only');
                }
                master.used -= 1;
                if (s === '=') {
                    master.init = true;
                }
            }
        } else if (that.id === '.' || that.id === '[') {
            if (!that.first || that.first.string === 'arguments') {
                that.warn('bad_assignment');
            }
        } else {
            that.warn('bad_assignment');
        }
    }


    function assignop(s, op) {
        var x = infix(s, 20, function (left, that) {
            var next;
            that.first = left;
            lvalue(left, s);
            that.second = expression(20);
            if (that.id === '=' && are_similar(that.first, that.second)) {
                that.warn('weird_assignment');
            }
            next = that;
            while (next_token.id === '=') {
                lvalue(next.second, '=');
                next_token.first = next.second;
                next.second = next_token;
                next = next_token;
                advance('=');
                next.second = expression(20);
            }
            return that;
        });
        x.assign = true;
        if (op) {
            if (syntax[op].bitwise) {
                x.bitwise = true;
            }
        }
        return x;
    }


    function bitwise(s, p) {
        var x = infix(s, p, 'number');
        x.bitwise = true;
        return x;
    }


    function suffix(s) {
        var x = symbol(s, 150);
        x.led = function (left) {
            no_space_only(prev_token, token);
            if (!option.plusplus) {
                this.warn('unexpected_a');
            } else if ((!left.identifier || left.reserved) &&
                    left.id !== '.' && left.id !== '[') {
                this.warn('bad_operand');
            }
            this.first = left;
            this.arity = 'suffix';
            return this;
        };
        return x;
    }


    function optional_identifier(variable) {
        if (next_token.identifier) {
            advance();
            if (token.reserved && (!option.es5 || variable)) {
                token.warn('expected_identifier_a_reserved');
            }
            return token.string;
        }
    }


    function identifier(variable) {
        var i = optional_identifier(variable);
        if (!i) {
            next_token.stop(token.id === 'function' && next_token.id === '('
                ? 'name_function'
                : 'expected_identifier_a');
        }
        return i;
    }


    function statement() {

        var label, preamble, the_statement;

// We don't like the empty statement.

        if (next_token.id === ';') {
            next_token.warn('unexpected_a');
            semicolon();
            return;
        }

// Is this a labeled statement?

        if (next_token.identifier && !next_token.reserved && peek().id === ':') {
            edge('label');
            label = next_token;
            advance();
            advance(':');
            define('label', label);
            if (next_token.labeled !== true || funct === global_funct) {
                label.stop('unexpected_label_a');
            } else if (jx.test(label.string + ':')) {
                label.warn('url');
            }
            next_token.label = label;
            label.init = true;
        }

// Parse the statement.

        preamble = next_token;
        if (token.id !== 'else') {
            edge();
        }
        step_in('statement');
        the_statement = expression(0, true);
        if (the_statement) {

// Look for the final semicolon.

            if (the_statement.arity === 'statement') {
                if (the_statement.id === 'switch' ||
                        (the_statement.block && the_statement.id !== 'do')) {
                    spaces();
                } else {
                    semicolon();
                }
            } else {

// If this is an expression statement, determine if it is acceptable.
// We do not like
//      new Blah;
// statements. If it is to be used at all, new should only be used to make
// objects, not side effects. The expression statements we do like do
// assignment or invocation or delete.

                if (the_statement.id === '(') {
                    if (the_statement.first.id === 'new') {
                        next_token.warn('bad_new');
                    }
                } else if (the_statement.id === '++' ||
                        the_statement.id === '--') {
                    lvalue(the_statement.first);
                } else if (!the_statement.assign &&
                        the_statement.id !== 'delete') {
                    if (!option.closure || !preamble.comments) {
                        preamble.warn('assignment_function_expression');
                    }
                }
                semicolon();
            }
        }
        step_out();
        if (label) {
            label.dead = true;
        }
        return the_statement;
    }


    function statements() {
        var array = [], disruptor, the_statement;

// A disrupt statement may not be followed by any other statement.
// If the last statement is disrupt, then the sequence is disrupt.

        while (next_token.postscript !== true) {
            if (next_token.id === ';') {
                next_token.warn('unexpected_a');
                semicolon();
            } else {
                if (next_token.string === 'use strict') {
                    if ((!node_js) || funct !== global_funct || array.length > 0) {
                        next_token.warn('function_strict');
                    }
                    use_strict();
                }
                if (disruptor) {
                    next_token.warn('unreachable_a_b', next_token.string,
                        disruptor.string);
                    disruptor = null;
                }
                the_statement = statement();
                if (the_statement) {
                    array.push(the_statement);
                    if (the_statement.disrupt) {
                        disruptor = the_statement;
                        array.disrupt = true;
                    }
                }
            }
        }
        return array;
    }


    function block(kind) {

// A block is a sequence of statements wrapped in braces.

        var array,
            curly = next_token,
            old_block_var = block_var,
            old_in_block = in_block,
            old_strict_mode = strict_mode;

        in_block = kind !== 'function' && kind !== 'try' && kind !== 'catch';
        block_var = [];
        if (curly.id === '{') {
            spaces();
            advance('{');
            step_in();
            if (kind === 'function' && !use_strict() && !old_strict_mode &&
                    !option.sloppy && funct.level === 1) {
                next_token.warn('missing_use_strict');
            }
            array = statements();
            strict_mode = old_strict_mode;
            step_out('}', curly);
        } else if (in_block) {
            curly.stop('expected_a_b', '{', artifact());
        } else {
            curly.warn('expected_a_b', '{', artifact());
            array = [statement()];
            array.disrupt = array[0].disrupt;
        }
        if (kind !== 'catch' && array.length === 0) {
            curly.warn('empty_block');
        }
        block_var.forEach(function (name) {
            scope[name].dead = true;
        });
        block_var = old_block_var;
        in_block = old_in_block;
        return array;
    }


    function tally_property(name) {
        if (option.properties && typeof property[name] !== 'number') {
            token.warn('unexpected_property_a', name);
        }
        if (property[name]) {
            property[name] += 1;
        } else {
            property[name] = 1;
        }
    }


// ECMAScript parser

    (function () {
        var x = symbol('(identifier)');
        x.nud = function () {
            var name = this.string,
                master = scope[name],
                writeable;

// If the master is not in scope, then we may have an undeclared variable.
// Check the predefined list. If it was predefined, create the global
// variable.

            if (!master) {
                writeable = predefined[name];
                if (typeof writeable === 'boolean') {
                    global_scope[name] = master = {
                        dead: false,
                        function: global_funct,
                        kind: 'var',
                        string: name,
                        writeable: writeable
                    };

// But if the variable is not in scope, and is not predefined, and if we are not
// in the global scope, then we have an undefined variable error.

                } else {
                    token.warn('used_before_a');
                }
            } else {
                this.master = master;
            }

// Annotate uses that cross scope boundaries.

            if (master) {
                if (master.kind === 'label') {
                    this.warn('a_label');
                } else {
                    if (master.dead === true || master.dead === funct) {
                        this.warn('a_scope');
                    }
                    master.used += 1;
                    if (master.function !== funct) {
                        if (master.function === global_funct) {
                            funct.global.push(name);
                        } else {
                            master.function.closure.push(name);
                            funct.outer.push(name);
                        }
                    }
                }
            }
            return this;
        };
        x.identifier = true;
    }());


// Build the syntax table by declaring the syntactic elements.

    type('(array)', 'array');
    type('(function)', 'function');
    type('(number)', 'number', return_this);
    type('(object)', 'object');
    type('(string)', 'string', return_this);
    type('(boolean)', 'boolean', return_this);
    type('(regexp)', 'regexp', return_this);

    ultimate('(begin)');
    ultimate('(end)');
    ultimate('(error)');
    postscript(symbol('}'));
    symbol(')');
    symbol(']');
    postscript(symbol('"'));
    postscript(symbol('\''));
    symbol(';');
    symbol(':');
    symbol(',');
    symbol('#');
    symbol('@');
    symbol('*/');
    postscript(reserve('case'));
    reserve('catch');
    postscript(reserve('default'));
    reserve('else');
    reserve('finally');

    reservevar('arguments', function (x) {
        if (strict_mode && funct === global_funct) {
            x.warn('strict');
        }
        funct.arguments = true;
    });
    reservevar('eval');
    constant('false', 'boolean');
    constant('Infinity', 'number');
    constant('NaN', 'number');
    constant('null', '');
    reservevar('this', function (x) {
        if (strict_mode && funct.statement && funct.name.charAt(0) > 'Z') {
            x.warn('strict');
        }
    });
    constant('true', 'boolean');
    constant('undefined', '');

    infix('?', 30, function (left, that) {
        step_in('?');
        that.first = expected_condition(expected_relation(left));
        that.second = expression(0);
        spaces();
        step_out();
        var colon = next_token;
        advance(':');
        step_in(':');
        spaces();
        that.third = expression(10);
        that.arity = 'ternary';
        if (are_similar(that.second, that.third)) {
            colon.warn('weird_ternary');
        } else if (are_similar(that.first, that.second)) {
            that.warn('use_or');
        }
        step_out();
        return that;
    });

    infix('||', 40, function (left, that) {
        function paren_check(that) {
            if (that.id === '&&' && !that.paren) {
                that.warn('and');
            }
            return that;
        }

        that.first = paren_check(expected_condition(expected_relation(left)));
        that.second = paren_check(expected_relation(expression(40)));
        if (are_similar(that.first, that.second)) {
            that.warn('weird_condition');
        }
        return that;
    });

    infix('&&', 50, function (left, that) {
        that.first = expected_condition(expected_relation(left));
        that.second = expected_relation(expression(50));
        if (are_similar(that.first, that.second)) {
            that.warn('weird_condition');
        }
        return that;
    });

    prefix('void', function (that) {
        that.first = expression(0);
        if (option.es5 || strict_mode) {
            that.warn('expected_a_b', 'undefined', 'void');
        } else if (that.first.number !== 0) {
            that.first.warn('expected_a_b', '0', artifact(that.first));
        }
        return that;
    });

    bitwise('|', 70);
    bitwise('^', 80);
    bitwise('&', 90);

    relation('==', '===');
    relation('===');
    relation('!=', '!==');
    relation('!==');
    relation('<');
    relation('>');
    relation('<=');
    relation('>=');

    bitwise('<<', 120);
    bitwise('>>', 120);
    bitwise('>>>', 120);

    infix('in', 120, function (left, that) {
        that.warn('infix_in');
        that.left = left;
        that.right = expression(130);
        return that;
    });
    infix('instanceof', 120);
    infix('+', 130, function (left, that) {
        if (left.id === '(number)') {
            if (left.number === 0) {
                left.warn('unexpected_a', '0');
            }
        } else if (left.id === '(string)') {
            if (left.string === '') {
                left.warn('expected_a_b', 'String', '\'\'');
            }
        }
        var right = expression(130);
        if (right.id === '(number)') {
            if (right.number === 0) {
                right.warn('unexpected_a', '0');
            }
        } else if (right.id === '(string)') {
            if (right.string === '') {
                right.warn('expected_a_b', 'String', '\'\'');
            }
        }
        if (left.id === right.id) {
            if (left.id === '(string)' || left.id === '(number)') {
                if (left.id === '(string)') {
                    left.string += right.string;
                    if (jx.test(left.string)) {
                        left.warn('url');
                    }
                } else {
                    left.number += right.number;
                }
                left.thru = right.thru;
                return left;
            }
        }
        that.first = left;
        that.second = right;
        return that;
    });
    prefix('+');
    prefix('+++', function () {
        token.warn('confusing_a');
        this.first = expression(150);
        this.arity = 'prefix';
        return this;
    });
    infix('+++', 130, function (left) {
        token.warn('confusing_a');
        this.first = left;
        this.second = expression(130);
        return this;
    });
    infix('-', 130, function (left, that) {
        if ((left.id === '(number)' && left.number === 0) || left.id === '(string)') {
            left.warn('unexpected_a');
        }
        var right = expression(130);
        if ((right.id === '(number)' && right.number === 0) || right.id === '(string)') {
            right.warn('unexpected_a');
        }
        if (left.id === right.id && left.id === '(number)') {
            left.number -= right.number;
            left.thru = right.thru;
            return left;
        }
        that.first = left;
        that.second = right;
        return that;
    });
    prefix('-');
    prefix('---', function () {
        token.warn('confusing_a');
        this.first = expression(150);
        this.arity = 'prefix';
        return this;
    });
    infix('---', 130, function (left) {
        token.warn('confusing_a');
        this.first = left;
        this.second = expression(130);
        return this;
    });
    infix('*', 140, function (left, that) {
        if ((left.id === '(number)' && (left.number === 0 || left.number === 1)) || left.id === '(string)') {
            left.warn('unexpected_a');
        }
        var right = expression(140);
        if ((right.id === '(number)' && (right.number === 0 || right.number === 1)) || right.id === '(string)') {
            right.warn('unexpected_a');
        }
        if (left.id === right.id && left.id === '(number)') {
            left.number *= right.number;
            left.thru = right.thru;
            return left;
        }
        that.first = left;
        that.second = right;
        return that;
    });
    infix('/', 140, function (left, that) {
        if ((left.id === '(number)' && left.number === 0) || left.id === '(string)') {
            left.warn('unexpected_a');
        }
        var right = expression(140);
        if ((right.id === '(number)' && (right.number === 0 || right.number === 1)) || right.id === '(string)') {
            right.warn('unexpected_a');
        }
        if (left.id === right.id && left.id === '(number)') {
            left.number /= right.number;
            left.thru = right.thru;
            return left;
        }
        that.first = left;
        that.second = right;
        return that;
    });
    infix('%', 140, function (left, that) {
        if ((left.id === '(number)' && (left.number === 0 || left.number === 1)) || left.id === '(string)') {
            left.warn('unexpected_a');
        }
        var right = expression(140);
        if ((right.id === '(number)' && right.number === 0) || right.id === '(string)') {
            right.warn('unexpected_a');
        }
        if (left.id === right.id && left.id === '(number)') {
            left.number %= right.number;
            left.thru = right.thru;
            return left;
        }
        that.first = left;
        that.second = right;
        return that;
    });

    suffix('++');
    prefix('++');

    suffix('--');
    prefix('--');
    prefix('delete', function (that) {
        one_space();
        var p = expression(0);
        if (!p || (p.id !== '.' && p.id !== '[')) {
            next_token.warn('deleted');
        }
        that.first = p;
        return that;
    });


    prefix('~', function (that) {
        no_space_only();
        if (!option.bitwise) {
            that.warn('unexpected_a');
        }
        that.first = expression(150);
        return that;
    });
    function banger(that) {
        no_space_only();
        that.first = expected_condition(expression(150));
        if (bang[that.first.id] === that || that.first.assign) {
            that.warn('confusing_a');
        }
        return that;
    }
    prefix('!', banger);
    prefix('!!', banger);
    prefix('typeof');
    prefix('new', function (that) {
        one_space();
        var c = expression(160), n, p, v;
        that.first = c;
        if (c.id !== 'function') {
            if (c.identifier) {
                switch (c.string) {
                case 'Object':
                    token.warn('use_object');
                    break;
                case 'Array':
                    if (next_token.id === '(') {
                        p = next_token;
                        p.first = this;
                        advance('(');
                        if (next_token.id !== ')') {
                            n = expression(0);
                            p.second = [n];
                            if (n.id !== '(number)' || next_token.id === ',') {
                                p.warn('use_array');
                            }
                            while (next_token.id === ',') {
                                advance(',');
                                p.second.push(expression(0));
                            }
                        } else {
                            token.warn('use_array');
                        }
                        advance(')', p);
                        return p;
                    }
                    token.warn('use_array');
                    break;
                case 'Number':
                case 'String':
                case 'Boolean':
                case 'Math':
                case 'JSON':
                    c.warn('not_a_constructor');
                    break;
                case 'Function':
                    if (!option.evil) {
                        next_token.warn('function_eval');
                    }
                    break;
                case 'Date':
                case 'RegExp':
                case 'this':
                    break;
                default:
                    if (c.id !== 'function') {
                        v = c.string.charAt(0);
                        if (!option.newcap && (v < 'A' || v > 'Z')) {
                            token.warn('constructor_name_a');
                        }
                    }
                }
            } else {
                if (c.id !== '.' && c.id !== '[' && c.id !== '(') {
                    token.warn('bad_constructor');
                }
            }
        } else {
            that.warn('weird_new');
        }
        if (next_token.id !== '(') {
            next_token.warn('missing_a', '()');
        }
        return that;
    });

    infix('(', 160, function (left, that) {
        var e, p;
        if (indent && indent.mode === 'expression') {
            no_space(prev_token, token);
        } else {
            no_space_only(prev_token, token);
        }
        if (!left.immed && left.id === 'function') {
            next_token.warn('wrap_immediate');
        }
        p = [];
        if (left.identifier) {
            if (left.string.match(/^[A-Z]([A-Z0-9_$]*[a-z][A-Za-z0-9_$]*)?$/)) {
                if (left.string !== 'Number' && left.string !== 'String' &&
                        left.string !== 'Boolean' && left.string !== 'Date') {
                    if (left.string === 'Math' || left.string === 'JSON') {
                        left.warn('not_a_function');
                    } else if (left.string === 'Object') {
                        token.warn('use_object');
                    } else if (left.string === 'Array' || !option.newcap) {
                        left.warn('missing_a', 'new');
                    }
                }
            }
        } else if (left.id === '.') {
            if (left.second.string === 'split' &&
                    left.first.id === '(string)') {
                left.second.warn('use_array');
            }
        }
        step_in();
        if (next_token.id !== ')') {
            no_space();
            for (;;) {
                edge();
                e = expression(10);
                if (left.string === 'Boolean' && (e.id === '!' || e.id === '~')) {
                    e.warn('weird_condition');
                }
                p.push(e);
                if (next_token.id !== ',') {
                    break;
                }
                comma();
            }
        }
        no_space();
        step_out(')', that);
        if (typeof left === 'object') {
            if (left.string === 'parseInt' && p.length === 1) {
                left.warn('radix');
            } else if (left.string === 'String' && p.length >= 1 && p[0].id === '(string)') {
                left.warn('unexpected_a');
            }
            if (!option.evil) {
                if (left.string === 'eval' || left.string === 'Function' ||
                        left.string === 'execScript') {
                    left.warn('evil');
                } else if (p[0] && p[0].id === '(string)' &&
                        (left.string === 'setTimeout' ||
                        left.string === 'setInterval')) {
                    left.warn('implied_evil');
                }
            }
            if (!left.identifier && left.id !== '.' && left.id !== '[' &&
                    left.id !== '(' && left.id !== '&&' && left.id !== '||' &&
                    left.id !== '?') {
                left.warn('bad_invocation');
            }
            if (left.id === '.') {
                if (p.length > 0 &&
                        left.first && left.first.first &&
                        are_similar(p[0], left.first.first)) {
                    if (left.second.string === 'call' ||
                            (left.second.string === 'apply' && (p.length === 1 ||
                            (p[1].arity === 'prefix' && p[1].id === '[')))) {
                        left.second.warn('unexpected_a');
                    }
                }
                if (left.second.string === 'toString') {
                    if (left.first.id === '(string)' || left.first.id === '(number)') {
                        left.second.warn('unexpected_a');
                    }
                }
            }
        }
        that.first = left;
        that.second = p;
        return that;
    }, true);

    prefix('(', function (that) {
        step_in('expression');
        no_space();
        edge();
        if (next_token.id === 'function') {
            next_token.immed = true;
        }
        var value = expression(0);
        value.paren = true;
        no_space();
        step_out(')', that);
        if (value.id === 'function') {
            switch (next_token.id) {
            case '(':
                next_token.warn('move_invocation');
                break;
            case '.':
            case '[':
                next_token.warn('unexpected_a');
                break;
            default:
                that.warn('bad_wrap');
            }
        } else if (!value.arity) {
            if (!option.closure || !that.comments) {
                that.warn('unexpected_a');
            }
        }
        return value;
    });

    infix('.', 170, function (left, that) {
        no_space(prev_token, token);
        no_space();
        var name = identifier();
        if (typeof name === 'string') {
            tally_property(name);
        }
        that.first = left;
        that.second = token;
        if (left && left.string === 'arguments' &&
                (name === 'callee' || name === 'caller')) {
            left.warn('avoid_a', 'arguments.' + name);
        } else if (!option.evil && left && left.string === 'document' &&
                (name === 'write' || name === 'writeln')) {
            left.warn('write_is_wrong');
        } else if (!option.stupid && syx.test(name)) {
            token.warn('sync_a');
        }
        if (!option.evil && (name === 'eval' || name === 'execScript')) {
            next_token.warn('evil');
        }
        return that;
    }, true);

    infix('[', 170, function (left, that) {
        var e, s;
        no_space_only(prev_token, token);
        no_space();
        step_in();
        edge();
        e = expression(0);
        switch (e.id) {
        case '(number)':
            if (e.id === '(number)' && left.id === 'arguments') {
                left.warn('use_param', left);
            }
            break;
        case '(string)':
            if (!option.evil &&
                    (e.string === 'eval' || e.string === 'execScript')) {
                e.warn('evil');
            } else if (!option.sub && ix.test(e.string)) {
                s = syntax[e.string];
                if (!s || !s.reserved) {
                    e.warn('subscript');
                }
            }
            tally_property(e.string);
            break;
        }
        step_out(']', that);
        no_space(prev_token, token);
        that.first = left;
        that.second = e;
        return that;
    }, true);

    prefix('[', function (that) {
        that.first = [];
        step_in('array');
        while (next_token.id !== '(end)') {
            while (next_token.id === ',') {
                next_token.warn('unexpected_a');
                advance(',');
            }
            if (next_token.id === ']') {
                break;
            }
            indent.wrap = false;
            edge();
            that.first.push(expression(10));
            if (next_token.id === ',') {
                comma();
                if (next_token.id === ']' && !option.es5) {
                    token.warn('unexpected_a');
                    break;
                }
            } else {
                break;
            }
        }
        step_out(']', that);
        return that;
    }, 170);


    function property_name() {
        var id = optional_identifier();
        if (!id) {
            if (next_token.id === '(string)') {
                id = next_token.string;
                advance();
            } else if (next_token.id === '(number)') {
                id = next_token.number.toString();
                advance();
            }
        }
        return id;
    }



    assignop('=');
    assignop('+=', '+');
    assignop('-=', '-');
    assignop('*=', '*');
    assignop('/=', '/').nud = function () {
        next_token.stop('slash_equal');
    };
    assignop('%=', '%');
    assignop('&=', '&');
    assignop('|=', '|');
    assignop('^=', '^');
    assignop('<<=', '<<');
    assignop('>>=', '>>');
    assignop('>>>=', '>>>');

    function function_parameters() {
        var id, parameters = [], paren = next_token;
        advance('(');
        token.function = funct;
        step_in();
        no_space();
        if (next_token.id !== ')') {
            for (;;) {
                edge();
                id = identifier();
                define('parameter', token);
                parameters.push(id);
                token.init = true;
                token.writeable = true;
                if (next_token.id !== ',') {
                    break;
                }
                comma();
            }
        }
        no_space();
        step_out(')', paren);
        return parameters;
    }

    function do_function(func, name) {
        var old_funct = funct,
            old_option = option,
            old_scope = scope;
        scope = Object.create(old_scope);
        funct = {
            closure: [],
            global: [],
            level: old_funct.level + 1,
            line: next_token.line,
            loopage: 0,
            name: name || '\'' + (anonname || '').replace(nx, sanitize) + '\'',
            outer: [],
            scope: scope
        };
        funct.parameter = function_parameters();
        func.function = funct;
        option = Object.create(old_option);
        functions.push(funct);
        if (name) {
            func.name = name;
            func.string = name;
            define('function', func);
            func.init = true;
            func.used += 1;
        }
        func.writeable = false;
        one_space();
        func.block = block('function');
        Object.keys(scope).forEach(function (name) {
            var master = scope[name];
            if (!master.used && master.kind !== 'exception' &&
                    (master.kind !== 'parameter' || !option.unparam)) {
                master.warn('unused_a');
            } else if (!master.init) {
                master.warn('uninitialized_a');
            }
        });
        funct = old_funct;
        option = old_option;
        scope = old_scope;
    }

    prefix('{', function (that) {
        var get, i, j, name, p, set, seen = Object.create(null);
        that.first = [];
        step_in();
        while (next_token.id !== '}') {
            indent.wrap = false;

// JSLint recognizes the ES5 extension for get/set in object literals,
// but requires that they be used in pairs.

            edge();
            if (next_token.string === 'get' && peek().id !== ':') {
                if (!option.es5) {
                    next_token.warn('es5');
                }
                get = next_token;
                advance('get');
                one_space_only();
                name = next_token;
                i = property_name();
                if (!i) {
                    next_token.stop('missing_property');
                }
                get.string = '';
                do_function(get);
                if (funct.loopage) {
                    get.warn('function_loop');
                }
                p = get.first;
                if (p && p.length) {
                    p[0].warn('parameter_a_get_b', p[0].string, i);
                }
                comma();
                set = next_token;
                spaces();
                edge();
                advance('set');
                set.string = '';
                one_space_only();
                j = property_name();
                if (i !== j) {
                    token.stop('expected_a_b', i, j || next_token.string);
                }
                do_function(set);
                if (set.block.length === 0) {
                    token.warn('missing_a', 'throw');
                }
                p = set.first;
                if (!p || p.length !== 1) {
                    set.stop('parameter_set_a', 'value');
                } else if (p[0].string !== 'value') {
                    p[0].stop('expected_a_b', 'value', p[0].string);
                }
                name.first = [get, set];
            } else {
                name = next_token;
                i = property_name();
                if (typeof i !== 'string') {
                    next_token.stop('missing_property');
                }
                advance(':');
                spaces();
                name.first = expression(10);
            }
            that.first.push(name);
            if (seen[i] === true) {
                next_token.warn('duplicate_a', i);
            }
            seen[i] = true;
            tally_property(i);
            if (next_token.id !== ',') {
                break;
            }
            for (;;) {
                comma();
                if (next_token.id !== ',') {
                    break;
                }
                next_token.warn('unexpected_a');
            }
            if (next_token.id === '}' && !option.es5) {
                token.warn('unexpected_a');
            }
        }
        step_out('}', that);
        return that;
    });

    stmt('{', function () {
        next_token.warn('statement_block');
        this.arity = 'statement';
        this.block = statements();
        this.disrupt = this.block.disrupt;
        advance('}', this);
        return this;
    });

    stmt('/*global', directive);
    stmt('/*globals', directive);
    stmt('/*jslint', directive);
    stmt('/*member', directive);
    stmt('/*members', directive);
    stmt('/*property', directive);
    stmt('/*properties', directive);

    stmt('var', function () {

// JavaScript does not have block scope. It only has function scope. So,
// declaring a variable in a block can have unexpected consequences.

// var.first will contain an array, the array containing name tokens
// and assignment tokens.

        var assign, id, name;

        if (funct.loopage) {
            next_token.warn('var_loop');
        } else if (funct.varstatement && !option.vars) {
            next_token.warn('combine_var');
        }
        if (funct !== global_funct) {
            funct.varstatement = true;
        }
        this.arity = 'statement';
        this.first = [];
        step_in('var');
        for (;;) {
            name = next_token;
            id = identifier(true);
            define('var', name);
            name.dead = funct;
            if (next_token.id === '=') {
                assign = next_token;
                assign.first = name;
                spaces();
                advance('=');
                spaces();
                if (next_token.id === 'undefined') {
                    token.warn('unnecessary_initialize', id);
                }
                if (peek(0).id === '=' && next_token.identifier) {
                    next_token.stop('var_a_not');
                }
                assign.second = expression(0);
                assign.arity = 'infix';
                name.init = true;
                this.first.push(assign);
            } else {
                this.first.push(name);
            }
            name.dead = false;
            name.writeable = true;
            if (next_token.id !== ',') {
                break;
            }
            comma();
            indent.wrap = false;
            if (var_mode && next_token.line === token.line &&
                    this.first.length === 1) {
                var_mode = null;
                indent.open = false;
                indent.at -= option.indent;
            }
            spaces();
            edge();
        }
        var_mode = null;
        step_out();
        return this;
    });

    stmt('function', function () {
        one_space();
        if (in_block) {
            token.warn('function_block');
        }
        var name = next_token,
            id = identifier(true);
        define('var', name);
        name.init = true;
        name.statement = true;
        no_space();
        this.arity = 'statement';
        do_function(this, id);
        if (next_token.id === '(' && next_token.line === token.line) {
            next_token.stop('function_statement');
        }
        return this;
    });

    prefix('function', function (that) {
        var id = optional_identifier(true), name;
        if (id) {
            name = token;
            no_space();
        } else {
            id = '';
        }
        do_function(that, id);
        if (name) {
            name.function = that.function;
        }
        if (funct.loopage) {
            that.warn('function_loop');
        }
        switch (next_token.id) {
        case ';':
        case '(':
        case ')':
        case ',':
        case ']':
        case '}':
        case ':':
            break;
        case '.':
            if (peek().string !== 'bind' || peek(1).id !== '(') {
                next_token.warn('unexpected_a');
            }
            break;
        default:
            next_token.stop('unexpected_a');
        }
        that.arity = 'function';
        return that;
    });

    stmt('if', function () {
        var paren = next_token;
        one_space();
        advance('(');
        step_in('control');
        no_space();
        edge();
        this.arity = 'statement';
        this.first = expected_condition(expected_relation(expression(0)));
        no_space();
        step_out(')', paren);
        one_space();
        this.block = block('if');
        if (next_token.id === 'else') {
            if (this.block.disrupt) {
                next_token.warn('unnecessary_else');
            }
            one_space();
            advance('else');
            one_space();
            this.else = next_token.id === 'if' || next_token.id === 'switch'
                ? statement(true)
                : block('else');
            if (this.else.disrupt && this.block.disrupt) {
                this.disrupt = true;
            }
        }
        return this;
    });

    stmt('try', function () {

// try.first    The catch variable
// try.second   The catch clause
// try.third    The finally clause
// try.block    The try block

        var exception_variable, paren;
        one_space();
        this.arity = 'statement';
        this.block = block('try');
        if (next_token.id === 'catch') {
            one_space();
            advance('catch');
            one_space();
            paren = next_token;
            advance('(');
            step_in('control');
            no_space();
            edge();
            exception_variable = next_token;
            this.first = identifier();
            define('exception', exception_variable);
            exception_variable.init = true;
            no_space();
            step_out(')', paren);
            one_space();
            this.second = block('catch');
            if (this.second.length) {
                if (this.first === 'ignore') {
                    exception_variable.warn('unexpected_a');
                }
            } else {
                if (this.first !== 'ignore') {
                    exception_variable.warn('expected_a_b', 'ignore',
                        exception_variable.string);
                }
            }
            exception_variable.dead = true;
        }
        if (next_token.id === 'finally') {
            one_space();
            advance('finally');
            one_space();
            this.third = block('finally');
        } else if (!this.second) {
            next_token.stop('expected_a_b', 'catch', artifact());
        }
        return this;
    });

    labeled_stmt('while', function () {
        one_space();
        var paren = next_token;
        funct.loopage += 1;
        advance('(');
        step_in('control');
        no_space();
        edge();
        this.arity = 'statement';
        this.first = expected_relation(expression(0));
        if (this.first.id !== 'true') {
            expected_condition(this.first, 'unexpected_a');
        }
        no_space();
        step_out(')', paren);
        one_space();
        this.block = block('while');
        if (this.block.disrupt) {
            prev_token.warn('strange_loop');
        }
        funct.loopage -= 1;
        return this;
    });

    reserve('with');

    labeled_stmt('switch', function () {

// switch.first         the switch expression
// switch.second        the array of cases. A case is 'case' or 'default' token:
//    case.first        the array of case expressions
//    case.second       the array of statements
// If all of the arrays of statements are disrupt, then the switch is disrupt.

        var cases = [],
            old_in_block = in_block,
            particular,
            that = token,
            the_case = next_token,
            unbroken = true;

        function find_duplicate_case(value) {
            if (are_similar(particular, value)) {
                value.warn('duplicate_a');
            }
        }

        one_space();
        advance('(');
        no_space();
        step_in();
        this.arity = 'statement';
        this.first = expected_condition(expected_relation(expression(0)));
        no_space();
        step_out(')', the_case);
        one_space();
        advance('{');
        step_in();
        in_block = true;
        this.second = [];
        if (that.from !== next_token.from && !option.white) {
            next_token.warn('expected_a_at_b_c', next_token.string, that.from, next_token.from);
        }
        while (next_token.id === 'case') {
            the_case = next_token;
            cases.forEach(find_duplicate_case);
            the_case.first = [];
            the_case.arity = 'case';
            spaces();
            edge('case');
            advance('case');
            for (;;) {
                one_space();
                particular = expression(0);
                cases.forEach(find_duplicate_case);
                cases.push(particular);
                the_case.first.push(particular);
                if (particular.id === 'NaN') {
                    particular.warn('unexpected_a');
                }
                no_space_only();
                advance(':');
                if (next_token.id !== 'case') {
                    break;
                }
                spaces();
                edge('case');
                advance('case');
            }
            spaces();
            the_case.second = statements();
            if (the_case.second && the_case.second.length > 0) {
                particular = the_case.second[the_case.second.length - 1];
                if (particular.disrupt) {
                    if (particular.id === 'break') {
                        unbroken = false;
                    }
                } else {
                    next_token.warn('missing_a_after_b', 'break', 'case');
                }
            } else {
                next_token.warn('empty_case');
            }
            this.second.push(the_case);
        }
        if (this.second.length === 0) {
            next_token.warn('missing_a', 'case');
        }
        if (next_token.id === 'default') {
            spaces();
            the_case = next_token;
            the_case.arity = 'case';
            edge('case');
            advance('default');
            no_space_only();
            advance(':');
            spaces();
            the_case.second = statements();
            if (the_case.second && the_case.second.length > 0) {
                particular = the_case.second[the_case.second.length - 1];
                if (unbroken && particular.disrupt && particular.id !== 'break') {
                    this.disrupt = true;
                }
            }
            this.second.push(the_case);
        }
        spaces();
        step_out('}', this);
        in_block = old_in_block;
        return this;
    });

    stmt('debugger', function () {
        if (!option.debug) {
            this.warn('unexpected_a');
        }
        this.arity = 'statement';
        return this;
    });

    labeled_stmt('do', function () {
        funct.loopage += 1;
        one_space();
        this.arity = 'statement';
        this.block = block('do');
        if (this.block.disrupt) {
            prev_token.warn('strange_loop');
        }
        one_space();
        advance('while');
        var paren = next_token;
        one_space();
        advance('(');
        step_in();
        no_space();
        edge();
        this.first = expected_condition(expected_relation(expression(0)), 'unexpected_a');
        no_space();
        step_out(')', paren);
        funct.loopage -= 1;
        return this;
    });

    labeled_stmt('for', function () {

        var blok, filter, master, ok = false, paren = next_token, value;
        this.arity = 'statement';
        funct.loopage += 1;
        advance('(');
        if (next_token.id === ';') {
            no_space();
            advance(';');
            no_space();
            advance(';');
            no_space();
            advance(')');
            blok = block('for');
        } else {
            step_in('control');
            spaces(this, paren);
            no_space();
            if (next_token.id === 'var') {
                next_token.stop('move_var');
            }
            edge();
            if (peek(0).id === 'in') {
                this.forin = true;
                value = expression(1000);
                master = value.master;
                if (master.kind !== 'var' || master.function !== funct ||
                        !master.writeable || master.dead) {
                    value.warn('bad_in_a');
                }
                master.init = true;
                master.used -= 1;
                this.first = value;
                advance('in');
                this.second = expression(20);
                step_out(')', paren);
                blok = block('for');
                if (!option.forin) {
                    if (blok.length === 1 && typeof blok[0] === 'object') {
                        if (blok[0].id === 'if' && !blok[0].else) {
                            filter = blok[0].first;
                            while (filter.id === '&&') {
                                filter = filter.first;
                            }
                            switch (filter.id) {
                            case '===':
                            case '!==':
                                ok = filter.first.id === '['
                                    ? are_similar(filter.first.first, this.second) &&
                                        are_similar(filter.first.second, this.first)
                                    : filter.first.id === 'typeof' &&
                                        filter.first.first.id === '[' &&
                                        are_similar(filter.first.first.first, this.second) &&
                                        are_similar(filter.first.first.second, this.first);
                                break;
                            case '(':
                                ok = filter.first.id === '.' && ((
                                    are_similar(filter.first.first, this.second) &&
                                    filter.first.second.string === 'hasOwnProperty' &&
                                    are_similar(filter.second[0], this.first)
                                ) || (
                                    filter.first.first.id === '.' &&
                                    filter.first.first.first.first.string === 'Object' &&
                                    filter.first.first.first.id === '.' &&
                                    filter.first.first.first.second.string === 'prototype' &&
                                    filter.first.first.second.string === 'hasOwnProperty' &&
                                    filter.first.second.string === 'call' &&
                                    are_similar(filter.second[0], this.second) &&
                                    are_similar(filter.second[1], this.first)
                                ));
                                break;
                            }
                        } else if (blok[0].id === 'switch') {
                            ok = blok[0].id === 'switch' &&
                                blok[0].first.id === 'typeof' &&
                                blok[0].first.first.id === '[' &&
                                are_similar(blok[0].first.first.first, this.second) &&
                                are_similar(blok[0].first.first.second, this.first);
                        }
                    }
                    if (!ok) {
                        this.warn('for_if');
                    }
                }
            } else {
                edge();
                this.first = [];
                for (;;) {
                    this.first.push(expression(0, 'for'));
                    if (next_token.id !== ',') {
                        break;
                    }
                    comma();
                }
                semicolon();
                edge();
                this.second = expected_relation(expression(0));
                if (this.second.id !== 'true') {
                    expected_condition(this.second, 'unexpected_a');
                }
                semicolon(token);
                if (next_token.id === ';') {
                    next_token.stop('expected_a_b', ')', ';');
                }
                this.third = [];
                edge();
                for (;;) {
                    this.third.push(expression(0, 'for'));
                    if (next_token.id !== ',') {
                        break;
                    }
                    comma();
                }
                no_space();
                step_out(')', paren);
                one_space();
                blok = block('for');
            }
        }
        if (blok.disrupt) {
            prev_token.warn('strange_loop');
        }
        this.block = blok;
        funct.loopage -= 1;
        return this;
    });

    function optional_label(that) {
        var label = next_token.string,
            master;
        that.arity = 'statement';
        if (next_token.identifier && token.line === next_token.line) {
            one_space_only();
            master = scope[label];
            if (!master || master.kind !== 'label') {
                next_token.warn('not_a_label');
            } else if (master.dead || master.function !== funct) {
                next_token.warn('not_a_scope');
            } else {
                master.used += 1;
            }
            that.first = next_token;
            advance();
        }
        return that;

    }

    disrupt_stmt('break', function () {
        return optional_label(this);
    });

    disrupt_stmt('continue', function () {
        if (!option.continue) {
            this.warn('unexpected_a');
        }
        return optional_label(this);
    });

    disrupt_stmt('return', function () {
        if (funct === global_funct) {
            this.warn('unexpected_a');
        }
        this.arity = 'statement';
        if (next_token.id !== ';' && next_token.line === token.line) {
            if (option.closure) {
                spaces();
            } else {
                one_space_only();
            }
            if (next_token.id === '/' || next_token.id === '(regexp)') {
                next_token.warn('wrap_regexp');
            }
            this.first = expression(0);
            if (this.first.assign) {
                this.first.warn('unexpected_a');
            }
        }
        return this;
    });

    disrupt_stmt('throw', function () {
        this.arity = 'statement';
        one_space_only();
        this.first = expression(20);
        return this;
    });


//  Superfluous reserved words

    reserve('class');
    reserve('const');
    reserve('enum');
    reserve('export');
    reserve('extends');
    reserve('import');
    reserve('super');

// Harmony reserved words

    reserve('implements');
    reserve('interface');
    reserve('let');
    reserve('package');
    reserve('private');
    reserve('protected');
    reserve('public');
    reserve('static');
    reserve('yield');


// Parse JSON

    function json_value() {

        function json_object() {
            var brace = next_token, object = Object.create(null);
            advance('{');
            if (next_token.id !== '}') {
                while (next_token.id !== '(end)') {
                    while (next_token.id === ',') {
                        next_token.warn('unexpected_a');
                        advance(',');
                    }
                    if (next_token.id !== '(string)') {
                        next_token.warn('expected_string_a');
                    }
                    if (object[next_token.string] === true) {
                        next_token.warn('duplicate_a');
                    } else if (next_token.string === '__proto__') {
                        next_token.warn('dangling_a');
                    } else {
                        object[next_token.string] = true;
                    }
                    advance();
                    advance(':');
                    json_value();
                    if (next_token.id !== ',') {
                        break;
                    }
                    advance(',');
                    if (next_token.id === '}') {
                        token.warn('unexpected_a');
                        break;
                    }
                }
            }
            advance('}', brace);
        }

        function json_array() {
            var bracket = next_token;
            advance('[');
            if (next_token.id !== ']') {
                while (next_token.id !== '(end)') {
                    while (next_token.id === ',') {
                        next_token.warn('unexpected_a');
                        advance(',');
                    }
                    json_value();
                    if (next_token.id !== ',') {
                        break;
                    }
                    advance(',');
                    if (next_token.id === ']') {
                        token.warn('unexpected_a');
                        break;
                    }
                }
            }
            advance(']', bracket);
        }

        switch (next_token.id) {
        case '{':
            json_object();
            break;
        case '[':
            json_array();
            break;
        case 'true':
        case 'false':
        case 'null':
        case '(number)':
        case '(string)':
            advance();
            break;
        case '-':
            advance('-');
            no_space_only();
            advance('(number)');
            break;
        default:
            next_token.stop('unexpected_a');
        }
    }


// The actual JSLINT function itself.

    itself = function JSLint(the_source, the_option) {

        var i, predef, tree;
        itself.errors = [];
        itself.tree = '';
        itself.properties = '';
        begin = prev_token = token = next_token =
            Object.create(syntax['(begin)']);
        tokens = [];
        predefined = Object.create(null);
        add_to_predefined(standard);
        property = Object.create(null);
        if (the_option) {
            option = Object.create(the_option);
            predef = option.predef;
            if (predef) {
                if (Array.isArray(predef)) {
                    for (i = 0; i < predef.length; i += 1) {
                        predefined[predef[i]] = true;
                    }
                } else if (typeof predef === 'object') {
                    add_to_predefined(predef);
                }
            }
        } else {
            option = Object.create(null);
        }
        option.indent = +option.indent || 4;
        option.maxerr = +option.maxerr || 50;
        global_scope = scope = Object.create(null);
        global_funct = funct = {
            scope: scope,
            loopage: 0,
            level: 0
        };
        functions = [funct];
        block_var = [];

        comments = [];
        comments_off = false;
        in_block = false;
        indent = null;
        json_mode = false;
        lookahead = [];
        node_js = false;
        prereg = true;
        strict_mode = false;
        var_mode = null;
        warnings = 0;
        lex.init(the_source);

        assume();

        try {
            advance();
            if (next_token.id === '(number)') {
                next_token.stop('unexpected_a');
            } else {
                switch (next_token.id) {
                case '{':
                case '[':
                    comments_off = true;
                    json_mode = true;
                    json_value();
                    break;
                default:

// If the first token is a semicolon, ignore it. This is sometimes used when
// files are intended to be appended to files that may be sloppy. A sloppy
// file may be depending on semicolon insertion on its last line.

                    step_in(1);
                    if (next_token.id === ';' && !node_js) {
                        semicolon();
                    }
                    tree = statements();
                    begin.first = tree;
                    itself.tree = begin;
                    if (tree.disrupt) {
                        prev_token.warn('weird_program');
                    }
                }
            }
            indent = null;
            advance('(end)');
            itself.property = property;
        } catch (e) {
            if (e) {        // ~~
                itself.errors.push({
                    reason    : e.message,
                    line      : e.line || next_token.line,
                    character : e.character || next_token.from
                }, null);
            }
        }
        return itself.errors.length === 0;
    };

    function unique(array) {
        array = array.sort();
        var i, length = 0, previous, value;
        for (i = 0; i < array.length; i += 1) {
            value = array[i];
            if (value !== previous) {
                array[length] = value;
                previous = value;
                length += 1;
            }
        }
        array.length = length;
        return array;
    }

// Data summary.

    itself.data = function () {
        var data = {functions: []},
            function_data,
            i,
            scope,
            the_function;
        data.errors = itself.errors;
        data.json = json_mode;
        data.global = unique(Object.keys(global_scope));

        function selects(name) {
            var kind = scope[name].kind;
            switch (kind) {
            case 'var':
            case 'exception':
            case 'label':
                function_data[kind].push(name);
                break;
            }
        }

        for (i = 1; i < functions.length; i += 1) {
            the_function = functions[i];
            function_data = {
                name: the_function.name,
                line: the_function.line,
                level: the_function.level,
                parameter: the_function.parameter,
                var: [],
                exception: [],
                closure: unique(the_function.closure),
                outer: unique(the_function.outer),
                global: unique(the_function.global),
                label: []
            };
            scope = the_function.scope;
            Object.keys(scope).forEach(selects);
            function_data.var.sort();
            function_data.exception.sort();
            function_data.label.sort();
            data.functions.push(function_data);
        }
        data.tokens = tokens;
        return data;
    };

    itself.error_report = function (data) {
        var evidence, i, output = [], warning;
        if (data.errors.length) {
            if (data.json) {
                output.push('<cite>JSON: bad.</cite><br>');
            }
            for (i = 0; i < data.errors.length; i += 1) {
                warning = data.errors[i];
                if (warning) {
                    evidence = warning.evidence || '';
                    output.push('<cite>');
                    if (isFinite(warning.line)) {
                        output.push('<address>line ' +
                            String(warning.line) +
                            ' character ' + String(warning.character) +
                            '</address>');
                    }
                    output.push(warning.reason.entityify() + '</cite>');
                    if (evidence) {
                        output.push('<pre>' + evidence.entityify() + '</pre>');
                    }
                }
            }
        }
        return output.join('');
    };


    itself.report = function (data) {
        var dl, i, j, names, output = [], the_function;

        function detail(h, array) {
            var comma_needed = false;
            if (array.length) {
                output.push("<dt>" + h + "</dt><dd>");
                array.forEach(function (item) {
                    output.push((comma_needed ? ', ' : '') + item);
                    comma_needed = true;
                });
                output.push("</dd>");
            }
        }

        output.push('<dl class=level0>');
        if (data.global.length) {
            detail('global', data.global);
            dl = true;
        } else if (data.json) {
            if (!data.errors.length) {
                output.push("<dt>JSON: good.</dt>");
            }
        } else {
            output.push("<dt><i>No new global variables introduced.</i></dt>");
        }
        if (dl) {
            output.push("</dl>");
        } else {
            output[0] = '';
        }

        if (data.functions) {
            for (i = 0; i < data.functions.length; i += 1) {
                the_function = data.functions[i];
                names = [];
                if (the_function.params) {
                    for (j = 0; j < the_function.params.length; j += 1) {
                        names[j] = the_function.params[j].string;
                    }
                }
                output.push('<dl class=level' + the_function.level +
                    '><address>line ' + String(the_function.line) +
                    '</address>' + the_function.name.entityify() + '(' +
                    names.join(', ') + ')');
                detail('parameter', the_function.parameter);
                detail('variable', the_function.var);
                detail('exception', the_function.exception);
                detail('closure', the_function.closure);
                detail('outer', the_function.outer);
                detail('global', the_function.global);
                detail('label', the_function.label);
                output.push('</dl>');
            }
        }
        return output.join('');
    };

    itself.properties_report = function (property) {
        if (!property) {
            return '';
        }
        var i,
            key,
            keys = Object.keys(property).sort(),
            mem = '    ',
            name,
            not_first = false,
            output = ['/*properties'];
        for (i = 0; i < keys.length; i += 1) {
            key = keys[i];
            if (property[key] > 0) {
                if (not_first) {
                    mem += ', ';
                }
                name = ix.test(key)
                    ? key
                    : '\'' + key.replace(nx, sanitize) + '\'';
                if (mem.length + name.length >= 80) {
                    output.push(mem);
                    mem = '    ';
                }
                mem += name;
                not_first = true;
            }
        }
        output.push(mem, '*/\n');
        return output.join('\n');
    };

    itself.color = function (data) {
        var from,
            i = 1,
            level,
            line,
            result = [],
            thru,
            token = data.tokens[0];
        while (token && token.id !== '(end)') {
            from = token.from;
            line = token.line;
            thru = token.thru;
            level = token.function.level;
            do {
                thru = token.thru;
                token = data.tokens[i];
                i += 1;
            } while (token && token.line === line && token.from - thru < 5 &&
                    level === token.function.level);
            result.push({
                line: line,
                level: level,
                from: from,
                thru: thru
            });
        }
        return result;
    };

    itself.jslint = itself;

    itself.edition = '2013-05-31';

    return itself;
}());
if(typeof JSON!=="object"){JSON={}}(function(){function f(n){return n<10?"0"+n:n}if(typeof Date.prototype.toJSON!=="function"){Date.prototype.toJSON=function(key){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null};String.prototype.toJSON=Number.prototype.toJSON=Boolean.prototype.toJSON=function(key){return this.valueOf()}}var cx=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,escapable=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},rep;function quote(string){escapable.lastIndex=0;return escapable.test(string)?'"'+string.replace(escapable,function(a){var c=meta[a];return typeof c==="string"?c:"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+string+'"'}function str(key,holder){var i,k,v,length,mind=gap,partial,value=holder[key];if(value&&typeof value==="object"&&typeof value.toJSON==="function"){value=value.toJSON(key)}if(typeof rep==="function"){value=rep.call(holder,key,value)}switch(typeof value){case"string":return quote(value);case"number":return isFinite(value)?String(value):"null";case"boolean":case"null":return String(value);case"object":if(!value){return"null"}gap+=indent;partial=[];if(Object.prototype.toString.apply(value)==="[object Array]"){length=value.length;for(i=0;i<length;i+=1){partial[i]=str(i,value)||"null"}v=partial.length===0?"[]":gap?"[\n"+gap+partial.join(",\n"+gap)+"\n"+mind+"]":"["+partial.join(",")+"]";gap=mind;return v}if(rep&&typeof rep==="object"){length=rep.length;for(i=0;i<length;i+=1){if(typeof rep[i]==="string"){k=rep[i];v=str(k,value);if(v){partial.push(quote(k)+(gap?": ":":")+v)}}}}else{for(k in value){if(Object.prototype.hasOwnProperty.call(value,k)){v=str(k,value);if(v){partial.push(quote(k)+(gap?": ":":")+v)}}}}v=partial.length===0?"{}":gap?"{\n"+gap+partial.join(",\n"+gap)+"\n"+mind+"}":"{"+partial.join(",")+"}";gap=mind;return v}}if(typeof JSON.stringify!=="function"){JSON.stringify=function(value,replacer,space){var i;gap="";indent="";if(typeof space==="number"){for(i=0;i<space;i+=1){indent+=" "}}else{if(typeof space==="string"){indent=space}}rep=replacer;if(replacer&&typeof replacer!=="function"&&(typeof replacer!=="object"||typeof replacer.length!=="number")){throw new Error("JSON.stringify")}return str("",{"":value})}}if(typeof JSON.parse!=="function"){JSON.parse=function(text,reviver){var j;function walk(holder,key){var k,v,value=holder[key];if(value&&typeof value==="object"){for(k in value){if(Object.prototype.hasOwnProperty.call(value,k)){v=walk(value,k);if(v!==undefined){value[k]=v}else{delete value[k]}}}}return reviver.call(holder,key,value)}text=String(text);cx.lastIndex=0;if(cx.test(text)){text=text.replace(cx,function(a){return"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})}if(/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:\s*\[)+/g,""))){j=eval("("+text+")");return typeof reviver==="function"?walk({"":j},""):j}throw new SyntaxError("JSON.parse")}}}());
