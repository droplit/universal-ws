/// <reference types="mocha" />
import { expect } from 'chai';
import * as ws from '../';

describe('WebSockets', function () {
    it('Library exists', (done) => {
        expect(ws, 'Library exists').to.exist;
        done();
    });
});