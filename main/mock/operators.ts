import { getLookup } from '../helper';
import {
    ConstructorFunction,
    FunctionCallLookup,
    FunctionName,
    FunctionTypes,
    GetterTypes,
    IMocked,
    LookupParams,
    LookupType,
    OperatorFunction,
    SetterTypes,
} from './contracts';

/**
 * Mocks a function on an existing Mock.
 * Allows function call verification to be performed later in the test.
 * You can optionally set a mock function implementation that will be called.
 *
 * @param functionName
 * @param mockFunction
 */
export function setupFunction<T, C extends ConstructorFunction<T>, U extends FunctionName<T, C, 'function'>>(
    functionName: U,
    mockFunction?: T[U],
): OperatorFunction<T, C> {
    return (mocked: IMocked<T, C>) => {
        const functionReplacement = (...args: LookupParams<T, C, 'function', U>) => {
            let returnValue: any;

            if (mockFunction instanceof Function) {
                returnValue = mockFunction.apply(mocked.mock, args);
            }
            trackFunctionCall(mocked, 'function', functionName, args);

            return returnValue;
        };

        mocked.mock[functionName] = functionReplacement as any;
        mocked.functionCallLookup[functionName] = [];

        return mocked;
    };
}

/**
 * Mocks a staticfunction on an existing Mock.
 * Allows function call verification to be performed later in the test.
 * You can optionally set a mock function implementation that will be called.
 *
 * @param functionName
 * @param mockFunction
 */
export function setupStaticFunction<
    T,
    C extends ConstructorFunction<T>,
    U extends FunctionName<T, C, 'staticFunction'>
>(functionName: U, mockFunction?: C[U]): OperatorFunction<T, C> {
    return (mocked: IMocked<T, C>) => {
        const functionReplacement = (...args: LookupParams<T, C, 'staticFunction', U>) => {
            let returnValue: any;

            if (mockFunction instanceof Function) {
                returnValue = mockFunction.apply(mocked.mock, args);
            }
            trackFunctionCall(mocked, 'staticFunction', functionName, args);

            return returnValue;
        };

        mocked.mockConstructor[functionName] = functionReplacement as any;
        mocked.staticFunctionCallLookup[functionName] = [];

        return mocked;
    };
}

/**
 * Sets up a property on an existing Mock.
 * Allows the value of the property to be defined.
 * Enables get and set function call verification to be performed.
 *
 * @param propertyName
 * @param value
 */
export function setupProperty<T, C extends ConstructorFunction<T>, U extends FunctionName<T, C, 'getter'>>(
    propertyName: U,
    value?: T[U],
): OperatorFunction<T, C> {
    return defineProperty(propertyName, value != null ? () => value : undefined);
}

/**
 * Sets up a static property on an existing Mock.
 * Allows the value of the property to be defined.
 * Enables get and set function call verification to be performed.
 *
 * @param propertyName
 * @param value
 */
export function setupStaticProperty<T, C extends ConstructorFunction<T>, U extends FunctionName<T, C, 'staticGetter'>>(
    propertyName: U,
    value?: C[U],
): OperatorFunction<T, C> {
    return defineStaticProperty(propertyName, value ? () => value : undefined);
}

/**
 * Sets up a property on an existing Mock.
 * Allows getter and setter functions to be set.
 * Enables get and set function call verification to be performed.
 *
 * @param propertyName
 * @param value
 */
export function defineProperty<T, C extends ConstructorFunction<T>, U extends FunctionName<T, C, 'getter'>>(
    propertyName: U,
    getter?: () => T[U],
    setter?: (value: T[U]) => void,
): OperatorFunction<T, C> {
    return (mocked: IMocked<T, C>) => {
        return definePropertyImpl(mocked, 'getter', propertyName, getter, setter);
    };
}

/**
 * Sets up a static property on an existing Mock with constructor.
 * Allows getter and setter functions to be set.
 * Enables get and set function call verification to be performed.
 *
 * @param propertyName
 * @param value
 */
export function defineStaticProperty<T, C extends ConstructorFunction<T>, U extends FunctionName<T, C, 'staticGetter'>>(
    propertyName: U,
    getter?: () => C[U],
    setter?: (value: C[U]) => void,
): OperatorFunction<T, C> {
    return (mocked: IMocked<T, C>) => {
        return definePropertyImpl(mocked, 'staticGetter', propertyName, getter, setter);
    };
}

function definePropertyImpl<
    T,
    C extends ConstructorFunction<T>,
    U extends GetterTypes,
    K extends FunctionName<T, C, U>
>(
    mocked: IMocked<T, C>,
    lookupType: U,
    propertyName: K,
    getter?: () => any,
    setter?: (value: any) => void,
): IMocked<T, C> {
    const propertyGetter = () => {
        trackGetterCall(mocked, lookupType, propertyName);

        return getter ? getter() : undefined;
    };

    const setterLookupType: SetterTypes = lookupType === 'getter' ? 'setter' : 'staticSetter';
    const setterProperty: FunctionName<T, C, SetterTypes> = propertyName as any;

    const propertySetter = (value: any) => {
        trackSetterCall(mocked, setterLookupType, setterProperty, [value]);

        if (setter != null) {
            setter.apply(mocked.mock, [value]);
        }
    };

    let target: T | C;

    getLookup(mocked, lookupType)[propertyName] = [];

    switch (lookupType) {
        case 'staticGetter':
            target = mocked.mockConstructor;
            getLookup(mocked, 'staticSetter')[setterProperty] = [];
            break;
        default:
            target = mocked.mock;
            getLookup(mocked, 'setter')[setterProperty] = [];
            break;
    }

    Object.defineProperty(target, propertyName, {
        enumerable: true,
        get: propertyGetter,
        set: propertySetter,
        configurable: true,
    });

    return mocked;
}

function trackFunctionCall<
    T,
    C extends ConstructorFunction<T>,
    U extends FunctionTypes,
    K extends FunctionName<T, C, U>
>(mock: IMocked<T, C>, lookupType: U, functionName: K, params: LookupParams<T, C, U, K>) {
    const lookup = getLookup(mock, lookupType);

    trackCall(lookup, functionName, params);
}

function trackGetterCall<T, C extends ConstructorFunction<T>, U extends GetterTypes, K extends FunctionName<T, C, U>>(
    mock: IMocked<T, C>,
    lookupType: U,
    propertyName: K,
) {
    const lookup = getLookup(mock, lookupType);

    //  it's easier to have an array of empty arrays than just keep track of a count
    //  This allows us to use the same verification code as the setter and functions
    trackCall(lookup, propertyName, [] as LookupParams<T, C, U, K>);
}

function trackSetterCall<T, C extends ConstructorFunction<T>, U extends SetterTypes, K extends FunctionName<T, C, U>>(
    mock: IMocked<T, C>,
    lookupType: U,
    propertyName: K,
    param: LookupParams<T, C, U, K>,
) {
    const lookup = getLookup(mock, lookupType);

    trackCall(lookup, propertyName, param);
}

function trackCall<T, C extends ConstructorFunction<T>, U extends LookupType, K extends FunctionName<T, C, U>>(
    lookup: FunctionCallLookup<T, C, U>,
    name: K,
    params: LookupParams<T, C, U, K>,
) {
    let functionCalls: LookupParams<T, C, U, K>[] | undefined = lookup[name];

    if (functionCalls === undefined) {
        functionCalls = [] as LookupParams<T, C, U, K>[];
        lookup[name] = functionCalls;
    }

    functionCalls.push(params);
}
