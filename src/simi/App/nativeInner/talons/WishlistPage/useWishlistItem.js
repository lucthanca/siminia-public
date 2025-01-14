import { useCallback, useMemo, useState } from 'react';
import { useMutation, useLazyQuery } from '@apollo/client';

import { useCartContext } from '@magento/peregrine/lib/context/cart';
import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';
import defaultOperations from './wishlistItem.gql';
import cartOperations from '../CartPage/cartPage.gql'
import { useAwaitQuery } from '@magento/peregrine/lib/hooks/useAwaitQuery';
import { CREATE_CART as CREATE_CART_MUTATION } from '@magento/peregrine/lib/talons/CreateAccount/createAccount.gql';

const SUPPORTED_PRODUCT_TYPES = ['SimpleProduct', 'ConfigurableProduct'];

const mergeSupportedProductTypes = (supportedProductTypes = []) => {
    const newSupportedProductTypes = [...SUPPORTED_PRODUCT_TYPES];

    if (supportedProductTypes) {
        newSupportedProductTypes.push(...supportedProductTypes);
    }

    return newSupportedProductTypes;
};

/**
 * @function
 *
 * @param {String} props.item Wishlist Item data from GraphQL
 * @param {WishlistItemOperations} props.operations GraphQL operations for the Wishlist Item component
 * @param {String} props.wishlistId The ID of the wishlist this item belongs to
 *
 * @returns {WishlistItemProps}
 */
export const useWishlistItem = props => {
    const { item, onOpenAddToCartDialog, wishlistId } = props;

    const {
        configurable_options: selectedConfigurableOptions = [],
        id: itemId,
        product
    } = item;

    const {
        configurable_options: configurableOptions = [],
        __typename: productType,
        image,
        sku,
        stock_status: stockStatus
    } = product;
    const { label: imageLabel, url: imageURL } = image;

    const isSupportedProductType = useMemo(
        () =>
            mergeSupportedProductTypes(props.supportedProductTypes).includes(
                productType
            ),
        [props.supportedProductTypes, productType]
    );

    let operations = mergeOperations(defaultOperations, props.operations);
    operations = mergeOperations(operations, cartOperations);

    const {
        addWishlistItemToCartMutation,
        removeProductsFromWishlistMutation,
        getCartDetailsQuery,
        createCartMutaion
    } = operations;

    const [{ cartId }, { getCartDetails }] = useCartContext();

    const [fetchCartId] = useMutation(createCartMutaion);
    const fetchCartDetails = useAwaitQuery(getCartDetailsQuery);

    const [isRemovalInProgress, setIsRemovalInProgress] = useState(false);
    const [alertMsg, setAlertMsg] = useState(-1)

    // const [fetchCartDetails, { called, data, loading, refetch: refetchCartPage }] = useLazyQuery(
    //     getCartDetailsQuery,
    //     {
    //         fetchPolicy: 'cache-and-network',
    //         nextFetchPolicy: 'cache-first'
    //     }
    // );

    const [
        removeProductFromWishlistError,
        setRemoveProductFromWishlistError
    ] = useState(null);

    const cartItem = useMemo(() => {
        const item = {
            quantity: 1,
            sku
        };

        // Merge in additional input variables for configurable items
        if (
            selectedConfigurableOptions.length &&
            selectedConfigurableOptions.length === configurableOptions.length
        ) {
            const selectedOptionsArray = selectedConfigurableOptions.map(
                selectedOption => {
                    const {
                        id: attributeId,
                        value_id: selectedValueId
                    } = selectedOption;
                    const configurableOption = configurableOptions.find(
                        option => option.attribute_id_v2 === attributeId
                    );
                    const configurableOptionValue = configurableOption.values.find(
                        optionValue =>
                            optionValue.value_index === selectedValueId
                    );

                    return configurableOptionValue.uid;
                }
            );

            Object.assign(item, {
                selected_options: selectedOptionsArray
            });
        }

        return item;
    }, [configurableOptions, selectedConfigurableOptions, sku]);

    const [
        addWishlistItemToCart,
        {
            error: addWishlistItemToCartError,
            loading: addWishlistItemToCartLoading
        }
    ] = useMutation(addWishlistItemToCartMutation, {
        update: cache => {
            // clean up for cache fav product on category page
            cache.modify({
                id: 'ROOT_QUERY',
                fields: {
                    customerWishlistProducts: cachedProducts =>
                        cachedProducts.filter(
                            productSku => productSku !== sku
                        )
                }
            });

            // cache.modify({
            //     id: `CustomerWishlist:${wishlistId}`,
            //     fields: {
            //         items_v2: (cachedItems, { readField, Remove }) => {
            //             for (var i = 0; i < cachedItems.items.length; i++) {
            //                 if (readField('id', item) === itemId) {
            //                     return Remove;
            //                 }
            //             }

            //             return cachedItems;
            //         }
            //     }
            // });
        },
        variables: {
            wishlistId: parseInt(wishlistId),
            wishlistItemIds: [parseInt(itemId)]
        }
    });

    const [removeProductsFromWishlist] = useMutation(
        removeProductsFromWishlistMutation,
        {
            update: cache => {
                // clean up for cache fav product on category page
                cache.modify({
                    id: 'ROOT_QUERY',
                    fields: {
                        customerWishlistProducts: cachedProducts =>
                            cachedProducts.filter(
                                productSku => productSku !== sku
                            )
                    }
                });

                cache.modify({
                    id: `CustomerWishlist:${wishlistId}`,
                    fields: {
                        items_v2: (cachedItems, { readField, Remove }) => {
                            for (var i = 0; i < cachedItems.items.length; i++) {
                                if (readField('id', item) === itemId) {
                                    return Remove;
                                }
                            }

                            return cachedItems;
                        }
                    }
                });
            },
            variables: {
                wishlistId: wishlistId,
                wishlistItemsId: [itemId]
            }
        }
    );

    const handleAddToCart = useCallback(async () => {
        // if (
        //     configurableOptions.length === 0 ||
        //     selectedConfigurableOptions.length === configurableOptions.length
        // ) {
            try {
                await addWishlistItemToCart();
                // await fetchCartDetails({ variables: { cartId } });
                await getCartDetails({
                    fetchCartId,
                    fetchCartDetails
                });
                setAlertMsg(true)
            } catch (error) {
                console.error(error);
            }
        // } else {
        //     onOpenAddToCartDialog(item);
        // }
    }, [
        cartId,
        addWishlistItemToCart,
        // fetchCartDetails,
        getCartDetails,
        fetchCartDetails,
        fetchCartId,
        configurableOptions.length,
        item,
        onOpenAddToCartDialog,
        selectedConfigurableOptions.length
    ]);

    const handleRemoveProductFromWishlist = useCallback(async () => {
        try {
            setIsRemovalInProgress(true);
            await removeProductsFromWishlist();
        } catch (e) {
            setIsRemovalInProgress(false);
            console.error(e);
            setRemoveProductFromWishlistError(e);
            if (process.env.NODE_ENV !== 'production') {
                console.error(e);
            }
        }
    }, [removeProductsFromWishlist, setRemoveProductFromWishlistError]);

    const isInStock = stockStatus !== 'OUT_OF_STOCK';
    const addToCartButtonProps = useMemo(() => {
        return {
            disabled: addWishlistItemToCartLoading || !isInStock,
            onClick: handleAddToCart
        };
    }, [addWishlistItemToCartLoading, handleAddToCart, isInStock]);

    const imageProps = useMemo(() => {
        return {
            alt: imageLabel,
            src: imageURL,
            width: 400
        };
    }, [imageLabel, imageURL]);

    return {
        addToCartButtonProps,
        isRemovalInProgress,
        handleRemoveProductFromWishlist,
        hasError: !!addWishlistItemToCartError,
        hasRemoveProductFromWishlistError: !!removeProductFromWishlistError,
        imageProps,
        isSupportedProductType,
        isInStock,
        setAlertMsg,
        alertMsg
    };
};

/**
 * JSDoc type definitions
 */

/**
 * GraphQL operations for the Wishlist Item component
 *
 * @typedef {Object} WishlistItemOperations
 *
 * @property {GraphQLDocument} addWishlistItemToCartMutation Mutation to add item to the cart
 * @property {GraphQLDocument} removeProductsFromWishlistMutation Mutation to remove a product from a wishlist
 *
 * @see [`wishlistItem.gql.js`]{@link https://github.com/magento/pwa-studio/blob/develop/packages/venia-ui/lib/components/WishlistPage/wishlistItem.gql.js}
 * for queries used in Venia
 */

/**
 * Props data to use when rendering the Wishlist Item component
 *
 * @typedef {Object} WishlistItemProps
 *
 * @property {Function} handleRemoveProductFromWishlist Callback to actually remove product from wishlist
 * @property {Boolean} hasError Boolean which represents if there was an error adding the wishlist item to cart
 * @property {Boolean} hasRemoveProductFromWishlistError If there was an error removing a product from the wishlist
 * @property {Boolean} isRemovalInProgress Whether the remove product from wishlist operation is in progress
 * @property {Boolean} isSupportedProductType is this product type suported
 * @property {Boolean} isInStock is product in stock
 */
