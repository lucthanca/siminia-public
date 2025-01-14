import React from 'react';
import { FormattedMessage } from 'react-intl';

import { useItemsReview } from 'src/simi/App/nativeInner/talons/CheckoutPage/ItemsReview/useItemsReview';

import Item from './item';
import ShowAllButton from '@magento/venia-ui/lib/components/CheckoutPage/ItemsReview/showAllButton';
import LoadingIndicator from '@magento/venia-ui/lib/components/LoadingIndicator';
import { useStyle } from '@magento/venia-ui/lib/classify';

import defaultClasses from './itemsReview.module.css';

/**
 * Renders a list of items in an order.
 * @param {Object} props.data an optional static data object to render instead of making a query for data.
 */
const ItemsReview = props => {
    const { classes: propClasses } = props;

    const classes = useStyle(defaultClasses, propClasses);

    const talonProps = useItemsReview({
        data: props.data
    });

    const {
        items: itemsInCart,
        totalQuantity,
        showAllItems,
        setShowAllItems,
        isLoading,
        configurableThumbnailSource
    } = talonProps;

    const items = itemsInCart.map((item, index) => (
        <Item
            key={item.id}
            {...item}
            isHidden={!showAllItems && index >= 2}
            configurableThumbnailSource={configurableThumbnailSource}
        />
    ));

    const showAllItemsFooter = !showAllItems ? (
        <ShowAllButton onClick={setShowAllItems} />
    ) : null;

    if (isLoading) {
        return (
            <LoadingIndicator>
                <FormattedMessage
                    id={'checkoutPage.fetchingItemsInYourOrder'}
                    defaultMessage={'Fetching Items in your Order'}
                />
            </LoadingIndicator>
        );
    }

    return (
        <div className={classes.items_review_container}>
            <div className={classes.items_container}>
                <div className={classes.total_quantity}>
                    <span className={classes.total_quantity_amount}>
                        {totalQuantity}
                    </span>
                    <FormattedMessage
                        id={'checkoutPage.itemsInYourOrder'}
                        defaultMessage={' items in your order'}
                    />
                </div>
                {items}
            </div>
            {showAllItemsFooter}
        </div>
    );
};

export default ItemsReview;
