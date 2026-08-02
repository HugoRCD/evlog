export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },

    /*
     * Controls are flat. An earlier pass gave them a lit inner top edge to
     * suggest a bevel; at control size that highlight lands as a bright seam
     * across the top of the button rather than as light, and in light mode it
     * was a white line drawn through a white surface. What actually reads as
     * quality here is a crisp hairline, a surface one step off the page, and a
     * fast, definite response to being pressed.
     */
    button: {
      slots: {
        base: [
          'transition-[background-color,border-color,color,transform] duration-[--duration-fast] ease-out',
          'active:scale-[0.98]',
        ].join(' '),
      },
    },

    select: {
      slots: {
        base: 'transition-[background-color,border-color] duration-[--duration-fast]',
        // The menu genuinely floats over the page, so here a shadow has a
        // surface to fall on and does its job.
        content: 'shadow-[var(--shadow-md)]',
      },
    },

    selectMenu: {
      slots: {
        content: 'shadow-[var(--shadow-md)]',
      },
    },

    /*
     * The drawer floats: inset from every edge, rounded all round, carrying a
     * real shadow because there is finally a surface behind for it to fall on.
     * A panel welded to the side of the viewport reads as part of the chrome;
     * one with air around it reads as an object placed on top of the page.
     *
     * The scrim stays light and unblurred — obscuring the table behind it
     * removed the very context the drawer exists to explain.
     */
    slideover: {
      slots: {
        overlay: 'bg-black/25',
        content: [
          'ring-0 border border-default rounded-[--radius-lg] shadow-[var(--shadow-lg)]',
          'data-[state=open]:animate-[drawer-in_260ms_var(--ease-out)]',
          'data-[state=closed]:animate-[drawer-out_180ms_ease-in]',
        ].join(' '),
        header: 'divider-y px-5 py-4 sm:px-5',
        body: 'p-0 sm:p-0',
        title: 'text-[15px] font-medium text-highlighted',
        description: 'mt-0.5 text-[13px] text-muted',
        close: 'top-3.5 end-4 text-dimmed hover:text-toned',
      },
    },

    modal: {
      slots: {
        overlay: 'bg-black/25',
        content: 'shadow-[var(--shadow-lg)]',
      },
    },

    badge: {
      slots: {
        base: 'rounded-[--radius-sm] font-medium',
      },
    },

    tabs: {
      slots: {
        list: 'border-b-0',
        trigger: [
          'transition-colors duration-[--duration-fast]',
          'focus:outline-none focus-visible:outline-none',
          'focus-visible:ring-1 focus-visible:ring-accented focus-visible:ring-offset-0',
        ].join(' '),
      },
    },
  },
})
