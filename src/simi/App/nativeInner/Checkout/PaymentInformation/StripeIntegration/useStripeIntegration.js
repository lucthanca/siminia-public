import { useCallback, useEffect, useState, useMemo } from 'react';
import { useFormState, useFormApi } from 'informed';
import { useApolloClient, useQuery, useMutation } from '@apollo/client';
import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';
import Identify from 'src/simi/Helper/Identify';
import { showToastMessage } from 'src/simi/Helper/Message';
import { useCartContext } from '@magento/peregrine/lib/context/cart';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import DEFAULT_OPERATIONS from './stripeIntegration.gql';
import { useIntl } from 'react-intl';
import { showFogLoading, hideFogLoading } from 'src/simi/BaseComponents/Loading/GlobalLoading';
import { useFieldState } from 'informed';

const getRegion = region => {
    return region.region_id || region.label || region.code;
};

export const mapAddressData = rawAddressData => {
    if (rawAddressData) {
        const {
            firstName,
            lastName,
            city,
            postcode,
            phoneNumber,
            street,
            country,
            region
        } = rawAddressData;

        return {
            firstName,
            lastName,
            city,
            postcode,
            phoneNumber,
            street1: street[0],
            street2: street[1] || '',
            country: country.code,
            region: getRegion(region)
        };
    } else {
        return {};
    }
};

export const useStripeIntegration = props => {
    const { formatMessage } = useIntl();
    const {
        onSuccess,
        onReady,
        onError,
        shouldSubmit,
        resetShouldSubmit,
        paymentCode,
        placeOrderDisabled, // for stripe payment btn
        handleProceedOrder, // for stripe payment btn
        handleSavePaymentDone, // for stripe payment btn
    } = props;

    const operations = mergeOperations(DEFAULT_OPERATIONS, props.operations);

    const {
        getBillingAddressQuery,
        getIsBillingAddressSameQuery,
        getShippingAddressQuery,
        setBillingAddressMutation,
        setStripeIntegrationPayment
    } = operations;

    /**
     * Definitions
     */

    /**
     * `stepNumber` depicts the state of the process flow in credit card
     * payment flow.
     *
     * `0` No call made yet
     * `1` Billing address mutation intiated
     * `3` Payment information mutation intiated
     * `4` All mutations done
     */
    const [stepNumber, setStepNumber] = useState(0);

    const client = useApolloClient();
    const formState = useFormState();
    const { validate: validateBillingAddressForm } = useFormApi();
    const [{ cartId }] = useCartContext();

    const [selectedCard, setSelectedCard] = useState(0);

    const stripe = useStripe();
    const elements = useElements();

    const { data: billingAddressData } = useQuery(getBillingAddressQuery, {
        skip: !cartId,
        variables: { cartId }
    });
    const { data: shippingAddressData } = useQuery(getShippingAddressQuery, {
        skip: !cartId,
        variables: { cartId }
    });
    const { data: isBillingAddressSameData } = useQuery(
        getIsBillingAddressSameQuery,
        { skip: !cartId, variables: { cartId } }
    );

    const [
        updateBillingAddress,
        {
            error: billingAddressMutationError,
            called: billingAddressMutationCalled,
            loading: billingAddressMutationLoading
        }
    ] = useMutation(setBillingAddressMutation);

    const [
        setSelectedPaymentMethod,
        {
            error: ccMutationError,
            called: ccMutationCalled,
            loading: ccMutationLoading
        }
    ] = useMutation(setStripeIntegrationPayment);

    const shippingAddressCountry =
        shippingAddressData &&
        shippingAddressData.cart &&
        shippingAddressData.cart.shippingAddress &&
        shippingAddressData.cart.shippingAddress.length > 0
            ? shippingAddressData.cart.shippingAddresses[0].country.code
            : DEFAULT_COUNTRY_CODE;
    const isBillingAddressSame = formState.values.isBillingAddressSame;

    const isVirtual = useMemo(() => {
        return (
            (isBillingAddressSameData &&
                isBillingAddressSameData.cart.is_virtual) ||
            false
        );
    }, [isBillingAddressSameData]);

    const initialValues = useMemo(() => {
        let isBillingAddressSame = false;
        if (!isVirtual) {
            isBillingAddressSame = true;
            if (isBillingAddressSameData)
                isBillingAddressSame =
                    isBillingAddressSameData.cart.isBillingAddressSame;
        }

        let billingAddress = {};
        /**
         * If billing address is same as shipping address, do
         * not auto fill the fields.
         */
        if (billingAddressData && !isBillingAddressSame) {
            if (billingAddressData.cart.billingAddress) {
                const {
                    // eslint-disable-next-line no-unused-vars
                    __typename,
                    ...rawBillingAddress
                } = billingAddressData.cart.billingAddress;
                billingAddress = mapAddressData(rawBillingAddress);
            }
        }

        return { isBillingAddressSame, ...billingAddress };
    }, [isBillingAddressSameData, billingAddressData, isVirtual]);

    /**
     * Helpers
     */

    /**
     * This function sets the boolean isBillingAddressSame
     * in cache for future use. We use cache because there
     * is no way to save this on the cart in remote.
     */
     const setIsBillingAddressSameInCache = useCallback(() => {
        client.writeQuery({
            query: getIsBillingAddressSameQuery,
            data: {
                cart: {
                    __typename: 'Cart',
                    id: cartId,
                    isBillingAddressSame
                }
            }
        });
    }, [client, cartId, getIsBillingAddressSameQuery, isBillingAddressSame]);

        /**
     * This function sets the billing address on the cart using the
     * shipping address.
     */
         const setShippingAddressAsBillingAddress = useCallback(() => {
            const shippingAddress = shippingAddressData
                ? mapAddressData(shippingAddressData.cart.shippingAddresses[0])
                : {};
    
            updateBillingAddress({
                variables: {
                    cartId,
                    ...shippingAddress,
                    sameAsShipping: true
                }
            });
        }, [updateBillingAddress, shippingAddressData, cartId]);

        /**
     * This function sets the billing address on the cart using the
     * information from the form.
     */
         const setBillingAddress = useCallback(() => {
            const {
                firstName,
                lastName,
                country,
                street1,
                street2,
                city,
                region,
                postcode,
                phoneNumber
            } = formState.values;
    
            updateBillingAddress({
                variables: {
                    cartId,
                    firstName,
                    lastName,
                    country,
                    street1,
                    street2: street2 || '',
                    city,
                    region: getRegion(region),
                    postcode,
                    phoneNumber,
                    sameAsShipping: false
                }
            });
        }, [formState.values, updateBillingAddress, cartId]);

    const { value: saveNewCard } = useFieldState('stripe_save_new_card');

    /**
     * This function saves the nonce code from braintree
     * on the cart along with the payment method used in
     * this case `braintree`.
     */
    const updatePaymentDetailsOnCart = useCallback(() => {
        const stripeData = Identify.getDataFromStoreage(
            Identify.SESSION_STOREAGE,
            'simi_stripe_js_integration_customer_data'
        );
        if (!stripeData) {
            showToastMessage(
                formatMessage({
                    id: 'Please fill in your card data and click "Use Card"',
                    defaultMessage:
                        'Please fill in your card data and click "Use Card"'
                })
            );
            resetShouldSubmit();
            return;
        }
        setSelectedPaymentMethod({
            variables: {
                cartId,
                paymentCode,
                simiCcStripejsToken:
                    stripeData.id +
                    ':' +
                    stripeData.card.brand +
                    ':' +
                    stripeData.card.last4,
                simiCcSave: !!stripeData.saveNewCard,
                simiCcSaved: stripeData.isSavedCard
                    ? stripeData.id +
                      ':' +
                      stripeData.card.brand +
                      ':' +
                      stripeData.card.last4
                    : false
            }
        });
    }, [setSelectedPaymentMethod, cartId, paymentCode, resetShouldSubmit]); 

    const handleSubmit = async event => {
        // Block native form submission.
        if (event)
            event.preventDefault();
        if (!stripe || !elements) {
            return;
        }
        showFogLoading();

        const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: elements.getElement(CardElement),
        });

        if (error) {
            hideFogLoading();
            console.log('[error]', error);
        } else {
            console.log('[PaymentMethod]', paymentMethod);
            if (paymentMethod && paymentMethod.card && paymentMethod.id) {
                const stripeData = { ...paymentMethod };
                stripeData.saveNewCard = saveNewCard ? true : false;
                Identify.storeDataToStoreage(
                    Identify.SESSION_STOREAGE,
                    'simi_stripe_js_integration_customer_data',
                    stripeData
                );
                await updatePaymentDetailsOnCart();
                handleSavePaymentDone && handleSavePaymentDone();
                handleProceedOrder && handleProceedOrder();
            } else {
                hideFogLoading();
                if (onError) onError();
                showToastMessage(
                    formatMessage({
                        id: 'Sorry, we cannot validate your card',
                        defaultMessage: 'Sorry, we cannot validate your card'
                    })
                );
            }
        }
    };

    /**
     * Effects
     */

    /**
     * Step 1 effect
     *
     * User has clicked the update button
     */
     useEffect(() => {
        try {
            if (shouldSubmit) {
                /**
                 * Validate billing address fields and only process with
                 * submit if there are no errors.
                 *
                 * We do this because the user can click Review Order button
                 * without fillig in all fields and the form submission
                 * happens manually. The informed Form component validates
                 * on submission but that only happens when we use the onSubmit
                 * prop. In this case we are using manually submission because
                 * of the nature of the credit card submission process.
                 */
                validateBillingAddressForm();

                const hasErrors = Object.keys(formState.errors).length;

                if (!hasErrors) {
                    setStepNumber(1);
                    if (isBillingAddressSame) {
                        setShippingAddressAsBillingAddress();
                    } else {
                        setBillingAddress();
                    }
                    setIsBillingAddressSameInCache();
                } else {
                    throw new Error('Errors in the billing address form');
                }
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
        }
    }, [
        shouldSubmit,
        isBillingAddressSame,
        setShippingAddressAsBillingAddress,
        setBillingAddress,
        setIsBillingAddressSameInCache,
        resetShouldSubmit,
        validateBillingAddressForm,
        formState.errors
    ]);

    /**
     * Step 2 effect
     *
     * Billing address mutation has completed
     */
     useEffect(() => {
        try {
            const billingAddressMutationCompleted =
                billingAddressMutationCalled && !billingAddressMutationLoading;

            if (
                billingAddressMutationCompleted &&
                !billingAddressMutationError
            ) {
                /**
                 * Billing address save mutation is successful
                 * we can initiate the braintree nonce request
                 */
                setStepNumber(2);
                handleSubmit();
            }

            if (
                billingAddressMutationCompleted &&
                billingAddressMutationError
            ) {
                /**
                 * Billing address save mutation is not successful.
                 * Reset update button clicked flag.
                 */
                throw new Error('Billing address mutation failed');
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
        }
    }, [
        billingAddressMutationError,
        billingAddressMutationCalled,
        billingAddressMutationLoading,
        resetShouldSubmit
    ]);

    /**
     * Step 3 effect
     *
     * Credit card save mutation has completed
     */
     useEffect(() => {
        try {
            const ccMutationCompleted = ccMutationCalled && !ccMutationLoading;

            if (ccMutationCompleted && !ccMutationError) {
                if (onSuccess) {
                    onSuccess();
                }
                resetShouldSubmit();
                setStepNumber(4);
            }

            if (ccMutationCompleted && ccMutationError) {
                /**
                 * If credit card mutation failed, reset update button clicked so the
                 * user can click again and set `stepNumber` to 0.
                 */
                throw new Error('Payment save mutation failed.');
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
        }
    }, [
        ccMutationCalled,
        ccMutationLoading,
        onSuccess,
        resetShouldSubmit,
        ccMutationError
    ]);

    const errors = useMemo(
        () =>
            new Map([
                ['setBillingAddressMutation', billingAddressMutationError],
                ['setOfflinePaymentOnCartMutation', ccMutationError]
            ]),
        [billingAddressMutationError, ccMutationError]
    );

    return {
        errors,
        isVirtual,
        isBillingAddressSame,
        stepNumber,
        initialValues,
        shippingAddressCountry,
        updatePaymentDetailsOnCart,
        ccMutationLoading
    };
};
